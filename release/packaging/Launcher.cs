using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

namespace MBLivemap
{
    static class Program
    {
        const string MutexName = "Local\\MBLivemap";
        const string ShowEventName = "Local\\MBLivemap.Show";

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            EventWaitHandle showEvent = new EventWaitHandle(false, EventResetMode.AutoReset, ShowEventName);
            Mutex mutex = new Mutex(false, MutexName);
            bool owned = false;
            try
            {
                owned = mutex.WaitOne(0);
            }
            catch (AbandonedMutexException)
            {
                owned = true;
            }

            if (!owned)
            {
                showEvent.Set();
                return;
            }

            string folder = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(
                Path.DirectorySeparatorChar,
                Path.AltDirectorySeparatorChar);

            try
            {
                Application.Run(new StatusWindow(folder, showEvent));
            }
            finally
            {
                mutex.ReleaseMutex();
            }
        }
    }

    sealed class StatusWindow : Form
    {
        readonly string folder;
        readonly EventWaitHandle showEvent;
        readonly Label statusLabel;
        readonly Label detailLabel;
        readonly Button openButton;
        readonly NotifyIcon tray;
        readonly System.Windows.Forms.Timer poll;
        Process worker;
        int pid;
        volatile bool closed;
        bool stopping;
        bool started;

        public StatusWindow(string folder, EventWaitHandle showEvent)
        {
            this.folder = folder;
            this.showEvent = showEvent;

            Text = "MB Livemap";
            FormBorderStyle = FormBorderStyle.FixedSingle;
            MaximizeBox = false;
            ClientSize = new Size(440, 188);
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 10f);
            Icon = MakeIcon();

            Label heading = new Label();
            heading.Text = "MB Livemap";
            heading.Font = new Font("Segoe UI", 16f, FontStyle.Bold);
            heading.AutoSize = true;
            heading.Location = new Point(24, 16);

            statusLabel = new Label();
            statusLabel.Text = "Starting…";
            statusLabel.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
            statusLabel.ForeColor = Color.FromArgb(140, 90, 20);
            statusLabel.AutoSize = true;
            statusLabel.Location = new Point(24, 54);

            detailLabel = new Label();
            detailLabel.Text = "Windows may ask permission so an iPad can connect.";
            detailLabel.Location = new Point(24, 86);
            detailLabel.Size = new Size(392, 44);

            openButton = new Button();
            openButton.Text = "Open dashboard";
            openButton.Size = new Size(140, 32);
            openButton.Location = new Point(168, 140);
            openButton.Enabled = false;
            openButton.Click += delegate { OpenDashboard(); };

            Button stopButton = new Button();
            stopButton.Text = "Stop";
            stopButton.Size = new Size(90, 32);
            stopButton.Location = new Point(318, 140);
            stopButton.Click += delegate { Close(); };

            Controls.Add(heading);
            Controls.Add(statusLabel);
            Controls.Add(detailLabel);
            Controls.Add(openButton);
            Controls.Add(stopButton);

            tray = new NotifyIcon();
            tray.Icon = Icon;
            tray.Text = "MB Livemap is starting";
            tray.Visible = true;
            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Open dashboard", null, delegate { OpenDashboard(); });
            menu.Items.Add("Show window", null, delegate { Reveal(false); });
            menu.Items.Add("Stop", null, delegate { Close(); });
            tray.ContextMenuStrip = menu;
            tray.DoubleClick += delegate { Reveal(false); };

            poll = new System.Windows.Forms.Timer();
            poll.Interval = 2000;
            poll.Tick += delegate { CheckAlive(); };

            Thread watcher = new Thread(WatchShow);
            watcher.IsBackground = true;
            watcher.Start();

            Shown += delegate
            {
                Thread workerThread = new Thread(RunLaunch);
                workerThread.IsBackground = true;
                workerThread.Start();
            };
        }

        void WatchShow()
        {
            while (!closed)
            {
                if (showEvent.WaitOne(400) && !closed)
                    Post(delegate { Reveal(true); });
            }
        }

        void Reveal(bool openPage)
        {
            if (WindowState == FormWindowState.Minimized)
                WindowState = FormWindowState.Normal;
            Show();
            Activate();
            if (openPage && started)
                OpenDashboard();
        }

        void RunLaunch()
        {
            string script = Path.Combine(folder, "launch.ps1");
            if (!File.Exists(script))
            {
                Post(delegate
                {
                    Fail("The MB Livemap program files are incomplete. Download the package again.");
                });
                return;
            }

            ProcessStartInfo start = new ProcessStartInfo();
            start.FileName = "powershell.exe";
            start.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"" + script + "\"";
            start.WorkingDirectory = folder;
            start.UseShellExecute = false;
            start.CreateNoWindow = true;

            try
            {
                worker = Process.Start(start);
                worker.WaitForExit();
                int code = worker.ExitCode;
                Post(delegate { OnLaunchFinished(code); });
            }
            catch (Exception ex)
            {
                string message = ex.Message;
                Post(delegate
                {
                    Fail("MB Livemap could not start.\r\n" + message);
                });
            }
        }

        void Post(MethodInvoker action)
        {
            if (closed || IsDisposed)
                return;
            try
            {
                BeginInvoke(action);
            }
            catch (InvalidOperationException)
            {
            }
        }

        void OnLaunchFinished(int code)
        {
            if (stopping)
                return;
            if (code != 0)
            {
                stopping = true;
                KillNodeIfOurs();
                Close();
                return;
            }

            started = true;
            pid = FindNode();
            Text = "MB Livemap is running";
            statusLabel.Text = "Running";
            statusLabel.ForeColor = Color.FromArgb(27, 107, 58);
            detailLabel.Text = "This window stays open while MB Livemap is running. You can minimize it. Close it, or click Stop, when you are finished.";
            openButton.Enabled = true;
            tray.Text = "MB Livemap is running";
            tray.ShowBalloonTip(4000, "MB Livemap is running", "It stays in the taskbar until you click Stop.", ToolTipIcon.Info);
            poll.Start();
        }

        void CheckAlive()
        {
            if (stopping || !started || pid <= 0)
                return;

            bool alive = false;
            try
            {
                Process node = Process.GetProcessById(pid);
                alive = !node.HasExited;
            }
            catch (ArgumentException)
            {
                alive = false;
            }

            if (alive)
                return;

            poll.Stop();
            stopping = true;
            MessageBox.Show(
                this,
                "MB Livemap stopped. Details are in app\\logs\\bridge.log.",
                "MB Livemap",
                MessageBoxButtons.OK,
                MessageBoxIcon.Warning);
            Close();
        }

        void OpenDashboard()
        {
            if (!started)
                return;
            try
            {
                Process.Start("http://127.0.0.1:43127/?setup=1");
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "MB Livemap", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        void Fail(string text)
        {
            if (stopping)
                return;
            stopping = true;
            MessageBox.Show(this, text, "MB Livemap", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }

        int FindNode()
        {
            int fromFile = ReadPidFile();
            if (fromFile > 0 && IsAlive(fromFile))
                return fromFile;

            string nodePath = Path.Combine(folder, "runtime", "node.exe");
            Process[] processes = Process.GetProcessesByName("node");
            for (int i = 0; i < processes.Length; i++)
            {
                try
                {
                    if (string.Equals(processes[i].MainModule.FileName, nodePath, StringComparison.OrdinalIgnoreCase))
                        return processes[i].Id;
                }
                catch (Exception)
                {
                }
            }
            return fromFile;
        }

        int ReadPidFile()
        {
            string pidFile = Path.Combine(folder, "app", "bridge.pid");
            if (!File.Exists(pidFile))
                return 0;
            string text = File.ReadAllText(pidFile).Trim();
            int value;
            if (!int.TryParse(text, out value))
                return 0;
            return value;
        }

        static bool IsAlive(int processId)
        {
            try
            {
                Process node = Process.GetProcessById(processId);
                return !node.HasExited;
            }
            catch (ArgumentException)
            {
                return false;
            }
        }

        void KillNodeIfOurs()
        {
            int processId = ReadPidFile();
            if (processId <= 0 || worker == null)
                return;
            try
            {
                Process node = Process.GetProcessById(processId);
                if (node.HasExited)
                    return;
                if (node.StartTime < worker.StartTime.AddSeconds(-2))
                    return;
                node.Kill();
            }
            catch (Exception)
            {
            }
        }

        void KillNode()
        {
            int processId = pid > 0 ? pid : ReadPidFile();
            if (processId <= 0)
                return;
            try
            {
                Process node = Process.GetProcessById(processId);
                if (!node.HasExited)
                    node.Kill();
            }
            catch (Exception)
            {
            }

            string pidFile = Path.Combine(folder, "app", "bridge.pid");
            try
            {
                if (File.Exists(pidFile))
                    File.Delete(pidFile);
            }
            catch (Exception)
            {
            }
        }

        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            closed = true;
            poll.Stop();
            if (!stopping)
            {
                stopping = true;
                try
                {
                    if (worker != null && !worker.HasExited)
                        worker.Kill();
                }
                catch (Exception)
                {
                }
                KillNode();
                ThreadPool.QueueUserWorkItem(delegate
                {
                    Thread.Sleep(1200);
                    try
                    {
                        int processId = ReadPidFile();
                        if (processId > 0)
                        {
                            Process node = Process.GetProcessById(processId);
                            if (!node.HasExited)
                                node.Kill();
                        }
                    }
                    catch (Exception)
                    {
                    }
                });
            }

            tray.Visible = false;
            tray.Dispose();
            base.OnFormClosing(e);
        }

        static Icon MakeIcon()
        {
            Bitmap bmp = new Bitmap(32, 32);
            using (Graphics g = Graphics.FromImage(bmp))
            {
                g.SmoothingMode = SmoothingMode.AntiAlias;
                g.Clear(Color.FromArgb(27, 107, 58));
                using (Brush white = new SolidBrush(Color.White))
                    g.FillEllipse(white, 8, 8, 16, 16);
            }
            IntPtr handle = bmp.GetHicon();
            Icon raw = Icon.FromHandle(handle);
            Icon clone = (Icon)raw.Clone();
            DestroyIcon(handle);
            bmp.Dispose();
            return clone;
        }

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        static extern bool DestroyIcon(IntPtr handle);
    }
}
