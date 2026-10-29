using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("RepoCoach")]
[assembly: AssemblyDescription("RepoCoach - FE INTERVIEW LAB")]
[assembly: AssemblyProduct("RepoCoach")]
[assembly: AssemblyCompany("RepoCoach")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]
[assembly: AssemblyCopyright("MIT License - RepoCoach")]

internal static class Program
{
    internal const string SiteUrl = "https://repocoach-web.onrender.com/";

    [DllImport("shell32.dll")]
    private static extern int SetCurrentProcessExplicitAppUserModelID([MarshalAs(UnmanagedType.LPWStr)] string appId);

    [STAThread]
    private static int Main(string[] args)
    {
        bool diagnose = args.Length == 1 && args[0] == "--diagnose";
        try
        {
            string browser = FindBrowser();
            if (diagnose)
            {
                Console.WriteLine("name=RepoCoach");
                Console.WriteLine("url=" + SiteUrl);
                Console.WriteLine("browser=" + (browser ?? "system-default"));
                Console.WriteLine("mode=" + (browser == null ? "browser" : "app-window"));
                return 0;
            }
            SetCurrentProcessExplicitAppUserModelID("RepoCoach.Desktop");
            if (browser != null)
            {
                try
                {
                    Process.Start(new ProcessStartInfo(browser, "--app=\"" + SiteUrl + "\" --no-first-run") { UseShellExecute = false });
                    return 0;
                }
                catch (System.ComponentModel.Win32Exception) { /* Try the system browser below. */ }
            }
            Process.Start(new ProcessStartInfo(SiteUrl) { UseShellExecute = true });
            return 0;
        }
        catch
        {
            if (!diagnose)
            {
                Application.EnableVisualStyles();
                MessageBox.Show("无法打开 RepoCoach。请确认已安装 Microsoft Edge 或 Chrome，也可以在浏览器中访问：\n\n" + SiteUrl,
                    "RepoCoach", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            return 1;
        }
    }

    private static string FindBrowser()
    {
        string[] executables = { "msedge.exe", "chrome.exe" };
        foreach (string executable in executables)
        {
            foreach (RegistryKey hive in new RegistryKey[] { Registry.CurrentUser, Registry.LocalMachine })
            {
                try
                {
                    using (RegistryKey key = hive.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\App Paths\" + executable))
                    {
                        string candidate = key == null ? null : key.GetValue(null) as string;
                        if (candidate != null)
                        {
                            candidate = candidate.Trim('"');
                            if (File.Exists(candidate) && string.Equals(Path.GetFileName(candidate), executable, StringComparison.OrdinalIgnoreCase)) return candidate;
                        }
                    }
                }
                catch (System.Security.SecurityException) { }
            }
            string suffix = executable == "msedge.exe" ? @"Microsoft\Edge\Application\msedge.exe" : @"Google\Chrome\Application\chrome.exe";
            foreach (Environment.SpecialFolder folder in new Environment.SpecialFolder[] { Environment.SpecialFolder.ProgramFilesX86, Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.LocalApplicationData })
            {
                string candidate = Path.Combine(Environment.GetFolderPath(folder), suffix);
                if (File.Exists(candidate)) return candidate;
            }
        }
        return null;
    }
}
