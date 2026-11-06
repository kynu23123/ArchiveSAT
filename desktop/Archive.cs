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

[assembly: AssemblyTitle("SAT Archive")]
[assembly: AssemblyDescription("Historical SAT practice and score conversions")]
[assembly: AssemblyProduct("SAT Archive")]
[assembly: AssemblyVersion("0.3.0.0")]
[assembly: AssemblyFileVersion("0.3.0.0")]

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

    internal ArchiveWindow()
    {
        Text = "SAT Archive";
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
            browser.Settings.IsWebMessageEnabled = false;
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
