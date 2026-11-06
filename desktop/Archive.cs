using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("SAT Archive")]
[assembly: AssemblyDescription("Historical SAT practice and score conversions")]
[assembly: AssemblyProduct("SAT Archive")]
[assembly: AssemblyVersion("0.2.0.0")]
[assembly: AssemblyFileVersion("0.2.0.0")]

internal static class Program
{
    internal static readonly Assembly Bundle = Assembly.GetExecutingAssembly();

    [STAThread]
    private static void Main()
    {
        AppDomain.CurrentDomain.AssemblyResolve += ResolveWebViewAssembly;
        string profile = Environment.GetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER");
        string instance = @"Local\SATArchiveDesktop";
        if (!string.IsNullOrEmpty(profile))
        {
            using (var sha = SHA256.Create())
                instance += BitConverter.ToString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(profile)));
        }
        using (var mutex = new Mutex(false, instance))
        {
            try
            {
                if (!mutex.WaitOne(0)) return;
            }
            catch (AbandonedMutexException) { }

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new ArchiveWindow());
            }
            finally
            {
                mutex.ReleaseMutex();
            }
        }
    }

    private static Assembly ResolveWebViewAssembly(object sender, ResolveEventArgs args)
    {
        string name = new AssemblyName(args.Name).Name;
        if (name != "Microsoft.Web.WebView2.Core" && name != "Microsoft.Web.WebView2.WinForms")
            return null;

        using (var stream = Bundle.GetManifestResourceStream(name + ".dll"))
        using (var buffer = new MemoryStream())
        {
            stream.CopyTo(buffer);
            return Assembly.Load(buffer.ToArray());
        }
    }
}

internal sealed class ArchiveWindow : Form
{
    private const string Host = "sat-archive.local";
    private const string Home = "https://" + Host + "/";
    private const string ContentPolicy =
        "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; " +
        "base-uri 'none'; frame-ancestors 'none'";

    private readonly WebView2 view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = Color.FromArgb(12, 12, 12) };
    private readonly Panel titleBar = new Panel();
    private readonly Label titleLabel = new Label();
    private readonly Label titleLogo = new Label();
    private readonly List<Button> windowButtons = new List<Button>();

    internal ArchiveWindow()
    {
        Text = "SAT Archive";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        BackColor = Color.FromArgb(12, 12, 12);
        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(350, 500);
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        ClientSize = new Size(Math.Min(1440, area.Width - 32), Math.Min(900, area.Height - 64));
        Controls.Add(view);
        BuildTitleBar();
        Controls.Add(titleBar);
        Shown += OpenArchive;
    }

    private void BuildTitleBar()
    {
        Padding = new Padding(5);
        titleBar.Dock = DockStyle.Top;
        titleBar.Height = 36;
        titleBar.BackColor = BackColor;
        titleLabel.Dock = DockStyle.Fill;
        titleLabel.Text = Text;
        titleLabel.TextAlign = ContentAlignment.MiddleLeft;
        titleLabel.Padding = new Padding(8, 0, 0, 0);
        titleLabel.ForeColor = Color.White;
        titleLogo.Dock = DockStyle.Left;
        titleLogo.Width = 28;
        titleLogo.TextAlign = ContentAlignment.MiddleCenter;
        titleLogo.BackColor = Color.White;
        titleLogo.ForeColor = Color.Black;
        titleLogo.Paint += (sender, args) => {
            int x = (titleLogo.Width - 15) / 2, y = (titleLogo.Height - 14) / 2;
            using (var pen = new Pen(titleLogo.ForeColor, 1.3f)) {
                args.Graphics.DrawLines(pen, new[] { new Point(x + 2, y + 11), new Point(x, y + 11), new Point(x, y), new Point(x + 11, y), new Point(x + 11, y + 2) });
                args.Graphics.DrawRectangle(pen, x + 4, y + 4, 10, 10);
                args.Graphics.DrawLine(pen, x + 6, y + 10, x + 12, y + 10);
            }
        };

        var buttons = new FlowLayoutPanel { Dock = DockStyle.Right, Width = 132, FlowDirection = FlowDirection.RightToLeft, WrapContents = false };
        var close = WindowButton("×", "Close window", (sender, args) => Close());
        var maximize = WindowButton("□", "Maximize window", (sender, args) => ToggleMaximize());
        var minimize = WindowButton("−", "Minimize window", (sender, args) => WindowState = FormWindowState.Minimized);
        buttons.Controls.AddRange(new Control[] { close, maximize, minimize });
        titleBar.Controls.AddRange(new Control[] { titleLabel, titleLogo, buttons });
        titleBar.SizeChanged += (sender, args) => {
            foreach (Control button in buttons.Controls) button.Height = titleBar.Height;
        };
        Resize += (sender, args) => {
            maximize.Text = WindowState == FormWindowState.Maximized ? "❐" : "□";
            maximize.AccessibleName = WindowState == FormWindowState.Maximized ? "Restore window" : "Maximize window";
        };

        foreach (Control handle in new Control[] { titleBar, titleLabel, titleLogo })
        {
            handle.MouseDown += (sender, args) => {
                if (args.Button == MouseButtons.Left && args.Clicks == 1) {
                    ReleaseCapture();
                    SendMessage(Handle, 0x00A1, (IntPtr)2, IntPtr.Zero);
                }
            };
            handle.DoubleClick += (sender, args) => ToggleMaximize();
        }
    }

    private Button WindowButton(string glyph, string label, EventHandler click)
    {
        var button = new Button {
            Text = glyph, AccessibleName = label, Width = 44, Height = titleBar.Height,
            FlatStyle = FlatStyle.Flat, Margin = Padding.Empty, ForeColor = Color.White
        };
        button.FlatAppearance.BorderSize = 0;
        button.Click += click;
        windowButtons.Add(button);
        return button;
    }

    private void ToggleMaximize()
    {
        if (WindowState == FormWindowState.Maximized) WindowState = FormWindowState.Normal;
        else {
            MaximizedBounds = Screen.FromHandle(Handle).WorkingArea;
            WindowState = FormWindowState.Maximized;
        }
    }

    protected override void WndProc(ref Message message)
    {
        base.WndProc(ref message);
        if (message.Msg != 0x0084 || WindowState != FormWindowState.Normal) return;
        long point = message.LParam.ToInt64();
        var mouse = PointToClient(new Point(unchecked((short)point), unchecked((short)(point >> 16))));
        bool left = mouse.X < Padding.Left, right = mouse.X >= ClientSize.Width - Padding.Right;
        bool top = mouse.Y < Padding.Top, bottom = mouse.Y >= ClientSize.Height - Padding.Bottom;
        if (top) message.Result = (IntPtr)(left ? 13 : right ? 14 : 12);
        else if (bottom) message.Result = (IntPtr)(left ? 16 : right ? 17 : 15);
        else if (left || right) message.Result = (IntPtr)(left ? 10 : 11);
    }

    private void UpdateTitleBar(object sender, CoreWebView2WebMessageReceivedEventArgs request)
    {
        Uri origin;
        if (!Uri.TryCreate(request.Source, UriKind.Absolute, out origin) || !IsAppOrigin(origin)) return;
        string message;
        try { message = request.TryGetWebMessageAsString(); }
        catch (ArgumentException) { return; }
        if (message.Length > 140) return;
        string[] parts = message.Split('|');
        if (parts.Length != 8 || parts[0] != "titlebar") return;
        for (int i = 1; i <= 4; i++) if (!Regex.IsMatch(parts[i], "^#[0-9a-fA-F]{6}$")) return;
        int height;
        if (!int.TryParse(parts[5], out height) || height < 30 || height > 56) return;
        var background = ColorTranslator.FromHtml(parts[1]);
        var foreground = ColorTranslator.FromHtml(parts[2]);
        titleBar.BackColor = BackColor = background;
        titleBar.Height = height;
        titleLabel.ForeColor = foreground;
        titleLabel.Text = Text = parts[7].Trim();
        titleLogo.Visible = parts[6] == "1";
        titleLogo.BackColor = ColorTranslator.FromHtml(parts[3]);
        titleLogo.ForeColor = ColorTranslator.FromHtml(parts[4]);
        foreach (var button in windowButtons) {
            button.ForeColor = foreground;
            button.BackColor = background;
        }
    }

    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);

    private async void OpenArchive(object sender, EventArgs args)
    {
        try
        {
            string data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SAT Archive");
            CoreWebView2Environment.SetLoaderDllFolderPath(InstallLoader(data));
            var environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(data, "Profile"));
            if (IsDisposed) return;
            await view.EnsureCoreWebView2Async(environment);
            if (IsDisposed) return;

            CoreWebView2 browser = view.CoreWebView2;
            browser.Settings.AreDevToolsEnabled = false;
            browser.Settings.AreDefaultContextMenusEnabled = false;
            browser.Settings.IsStatusBarEnabled = false;
            browser.WebMessageReceived += UpdateTitleBar;
            browser.NewWindowRequested += (source, request) => request.Handled = true;
            browser.PermissionRequested += (source, request) => request.State = CoreWebView2PermissionState.Deny;
            browser.NavigationStarting += (source, request) =>
            {
                Uri url;
                request.Cancel = !Uri.TryCreate(request.Uri, UriKind.Absolute, out url)
                    || !IsAppOrigin(url) || url.AbsolutePath != "/";
            };

            browser.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All, CoreWebView2WebResourceRequestSourceKinds.All);
            browser.WebResourceRequested += (source, request) => ServeResource(environment, request);
            browser.Navigate(Home);
        }
        catch (Exception error)
        {
            if (IsDisposed) return;
            string message = error is WebView2RuntimeNotFoundException
                ? "Install the Microsoft Edge WebView2 Runtime, then open SAT Archive again."
                : "SAT Archive could not start. " + error.Message;
            MessageBox.Show(this, message, "SAT Archive", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    private static string InstallLoader(string data)
    {
        using (var stream = Program.Bundle.GetManifestResourceStream("WebView2Loader.dll"))
        using (var buffer = new MemoryStream())
        using (var sha = SHA256.Create())
        {
            stream.CopyTo(buffer);
            byte[] loader = buffer.ToArray();
            string digest = BitConverter.ToString(sha.ComputeHash(loader)).Replace("-", "");
            string directory = Path.Combine(data, "Loader", digest);
            Directory.CreateDirectory(directory);
            string file = Path.Combine(directory, "WebView2Loader.dll");
            if (!File.Exists(file) || BitConverter.ToString(sha.ComputeHash(File.ReadAllBytes(file))).Replace("-", "") != digest)
                File.WriteAllBytes(file, loader);
            return directory;
        }
    }

    private static bool IsAppOrigin(Uri url)
    {
        return url.Scheme == Uri.UriSchemeHttps && url.IsDefaultPort && url.Host == Host && url.UserInfo.Length == 0;
    }

    private static void ServeResource(CoreWebView2Environment environment, CoreWebView2WebResourceRequestedEventArgs request)
    {
        Uri url;
        Stream content = null;
        string headers = null;
        if (request.Request.Method == "GET" && Uri.TryCreate(request.Request.Uri, UriKind.Absolute, out url) && IsAppOrigin(url))
        {
            if (url.AbsolutePath == "/")
            {
                content = Program.Bundle.GetManifestResourceStream("Renderer.index.html");
                headers = "Content-Type: text/html; charset=utf-8\r\nContent-Security-Policy: " + ContentPolicy;
            }
            else if (Regex.IsMatch(url.AbsolutePath, @"^/assets/[A-Za-z0-9._-]+\.(js|mjs|css|woff2|pdf)$"))
            {
                string name = Path.GetFileName(url.AbsolutePath);
                content = Program.Bundle.GetManifestResourceStream("Renderer." + name);
                string mime;
                switch (Path.GetExtension(name))
                {
                    case ".js":
                    case ".mjs": mime = "text/javascript"; break;
                    case ".css": mime = "text/css"; break;
                    case ".pdf": mime = "application/pdf"; break;
                    default: mime = "font/woff2"; break;
                }
                headers = "Content-Type: " + mime;
            }
        }

        request.Response = content == null
            ? environment.CreateWebResourceResponse(null, 404, "Not Found", "")
            : environment.CreateWebResourceResponse(content, 200, "OK", headers);
    }
}
