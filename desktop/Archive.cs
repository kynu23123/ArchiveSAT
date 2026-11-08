using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: AssemblyTitle("SAT Archived")]
[assembly: AssemblyDescription("Historical SAT practice and score conversions")]
[assembly: AssemblyProduct("SAT Archived")]
[assembly: AssemblyVersion("1.1.0.0")]
[assembly: AssemblyFileVersion("1.1.0.0")]

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
    private bool savingOnClose;
    private bool readyToClose;
    private Rectangle windowedBounds;
    private FormWindowState windowedState;
    private int windowedStyle;
    private bool fullscreen;
    private int faviconVersion;

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr icon);

    [System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong(IntPtr window, int index);
    [System.Runtime.InteropServices.DllImport("user32.dll", EntryPoint = "SetWindowLongW")]
    private static extern int SetWindowLong(IntPtr window, int index, int value);
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);

    private void SetTestFullscreen(bool requested)
    {
        if (requested == fullscreen) return;
        fullscreen = requested;
        Rectangle bounds;
        if (requested)
        {
            windowedState = WindowState;
            windowedBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            WindowState = FormWindowState.Normal;
            windowedStyle = GetWindowLong(Handle, -16);
            // Preserve the window handle that owns the WebView controller.
            SetWindowLong(Handle, -16, windowedStyle & ~0x00c40000);
            bounds = Screen.FromControl(this).Bounds;
        }
        else
        {
            SetWindowLong(Handle, -16, windowedStyle);
            bounds = windowedBounds;
        }
        SetWindowPos(Handle, IntPtr.Zero, bounds.X, bounds.Y, bounds.Width, bounds.Height, 0x0034);
        if (!requested) WindowState = windowedState;
    }

    internal ArchiveWindow()
    {
        Text = "SAT Archived";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        BackColor = Color.FromArgb(12, 12, 12);
        FormBorderStyle = FormBorderStyle.Sizable;
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(350, 500);
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        ClientSize = new Size(Math.Min(1440, area.Width - 32), Math.Min(900, area.Height - 64));
        Controls.Add(view);
        Shown += OpenArchive;
    }

    protected override async void OnFormClosing(FormClosingEventArgs args)
    {
        base.OnFormClosing(args);
        if (args.Cancel || readyToClose || args.CloseReason != CloseReason.UserClosing || view.CoreWebView2 == null) return;
        args.Cancel = true;
        if (savingOnClose) return;
        savingOnClose = true;
        try
        {
            var save = view.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('sat-archive-save'))");
            await System.Threading.Tasks.Task.WhenAny(save, System.Threading.Tasks.Task.Delay(1500));
            if (save.IsCompleted) await save;
        }
        catch (InvalidOperationException) { }
        catch (System.Runtime.InteropServices.COMException) { }
        readyToClose = true;
        BeginInvoke(new Action(Close));
    }

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
            browser.Settings.IsWebMessageEnabled = true;
            browser.WebMessageReceived += (source, message) =>
            {
                Uri origin;
                if (!Uri.TryCreate(message.Source, UriKind.Absolute, out origin) || !IsAppOrigin(origin) || origin.AbsolutePath != "/") return;
                string command;
                try { command = message.TryGetWebMessageAsString(); }
                catch (ArgumentException) { return; }
                if (command == "test-fullscreen:enter") SetTestFullscreen(true);
                else if (command == "test-fullscreen:exit") SetTestFullscreen(false);
            };
            browser.FaviconChanged += async (source, change) =>
            {
                int version = ++faviconVersion;
                try
                {
                    using (var stream = await browser.GetFaviconAsync(CoreWebView2FaviconImageFormat.Png))
                    {
                        if (IsDisposed || stream == null || version != faviconVersion) return;
                        // GDI+ needs a seekable stream; the WebView favicon stream is forward-only.
                        using (var buffer = new MemoryStream())
                        {
                            stream.CopyTo(buffer);
                            buffer.Position = 0;
                            using (var bitmap = new Bitmap(buffer))
                            {
                                IntPtr handle = bitmap.GetHicon();
                                try
                                {
                                    var old = Icon;
                                    Icon = (Icon)Icon.FromHandle(handle).Clone();
                                    if (old != null) old.Dispose();
                                }
                                finally { DestroyIcon(handle); }
                            }
                        }
                    }
                }
                catch (ArgumentException) { }
                catch (InvalidOperationException) { }
                catch (NotImplementedException) { }
                catch (NotSupportedException) { }
                catch (System.Runtime.InteropServices.COMException) { }
            };
            browser.ContainsFullScreenElementChanged += (source, change) => SetTestFullscreen(browser.ContainsFullScreenElement);
            browser.NewWindowRequested += (source, request) =>
            {
                request.Handled = true;
                if (!request.IsUserInitiated || browser.Source != Home
                    || request.Uri != "https://cognitivemetrics.com/wiki/old-sat") return;
                try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(request.Uri) { UseShellExecute = true }); }
                catch (System.ComponentModel.Win32Exception) { MessageBox.Show(this, "Open https://cognitivemetrics.com/wiki/old-sat in your browser.", "Reference link"); }
            };
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
                ? "Install the Microsoft Edge WebView2 Runtime, then open SAT Archived again."
                : "SAT Archived could not start. " + error.Message;
            MessageBox.Show(this, message, "SAT Archived", MessageBoxButtons.OK, MessageBoxIcon.Error);
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
            else if (Regex.IsMatch(url.AbsolutePath, @"^/assets/[A-Za-z0-9._-]+\.(js|mjs|css|woff2|pdf|json|png)$"))
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
                    case ".json": mime = "application/json"; break;
                    case ".png": mime = "image/png"; break;
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

