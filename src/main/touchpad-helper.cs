// Streams finger contacts from a Windows Precision Touchpad to stdout, for
// tracing symbols on the trackpad (src/main/touchpad.ts compiles and runs it).
//
// Browsers only see the cursor a trackpad moves. Windows' Raw Input API
// delivers the touchpad's own HID reports, with each finger's absolute
// position and whether it touches (the tip switch), so a lift is exact.
//
// Output, one line each:
//   size <width> <height>          the pad's physical size (its aspect ratio)
//   c <id> <tip 0|1> <x> <y>       a contact; x, y from 0 to 1 across the pad
//   b <0|1>                        the pad pressed down (a physical click;
//                                  tap-to-click never sets this)
//   err <message>
// It exits when stdin closes, so it never outlives the app.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

static class TouchpadHelper
{
    const int WM_INPUT = 0x00FF;
    const uint RID_INPUT = 0x10000003;
    const uint RIDI_PREPARSEDDATA = 0x20000005;
    const uint RIDEV_INPUTSINK = 0x00000100;
    const int HIDP_STATUS_SUCCESS = 0x00110000;
    const int HidP_Input = 0;

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTDEVICE { public ushort UsagePage, Usage; public uint Flags; public IntPtr Target; }

    [StructLayout(LayoutKind.Sequential)]
    struct HIDP_CAPS
    {
        public ushort Usage, UsagePage, InputReportByteLength, OutputReportByteLength, FeatureReportByteLength;
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 17)] public ushort[] Reserved;
        public ushort NumberLinkCollectionNodes, NumberInputButtonCaps, NumberInputValueCaps, NumberInputDataIndices;
        public ushort NumberOutputButtonCaps, NumberOutputValueCaps, NumberOutputDataIndices;
        public ushort NumberFeatureButtonCaps, NumberFeatureValueCaps, NumberFeatureDataIndices;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct HIDP_VALUE_CAPS
    {
        public ushort UsagePage; public byte ReportID, IsAlias; public ushort BitField, LinkCollection, LinkUsage, LinkUsagePage;
        public byte IsRange, IsStringRange, IsDesignatorRange, IsAbsolute, HasNull, Reserved;
        public ushort BitSize, ReportCount, R1, R2, R3, R4, R5;
        public uint UnitsExp, Units;
        public int LogicalMin, LogicalMax, PhysicalMin, PhysicalMax;
        public ushort UsageMin, UsageMax, StringMin, StringMax, DesignatorMin, DesignatorMax, DataIndexMin, DataIndexMax;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct RAWINPUTDEVICELIST { public IntPtr Device; public uint Type; }

    [StructLayout(LayoutKind.Explicit, Size = 32)]
    struct RID_DEVICE_INFO
    {
        [FieldOffset(0)] public uint Size;
        [FieldOffset(4)] public uint Type;
        [FieldOffset(20)] public ushort UsagePage; // hid.usUsagePage
        [FieldOffset(22)] public ushort Usage;
    }

    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetRawInputDeviceList([Out] RAWINPUTDEVICELIST[] list, ref uint count, uint size);
    [DllImport("user32.dll", SetLastError = true, EntryPoint = "GetRawInputDeviceInfoW")]
    static extern uint GetRawInputDeviceInfo(IntPtr device, uint command, ref RID_DEVICE_INFO info, ref uint size);
    const uint RIDI_DEVICEINFO = 0x2000000b;

    /// <summary>Describes every Precision Touchpad now, so the size line comes before any touch.</summary>
    static int FindTouchpads()
    {
        uint n = 0, itemSize = (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICELIST));
        GetRawInputDeviceList(null, ref n, itemSize);
        var list = new RAWINPUTDEVICELIST[n];
        GetRawInputDeviceList(list, ref n, itemSize);
        int found = 0;
        foreach (var item in list)
        {
            if (item.Type != 2) continue; // RIM_TYPEHID
            var info = new RID_DEVICE_INFO { Size = 32 };
            uint size = 32;
            if (GetRawInputDeviceInfo(item.Device, RIDI_DEVICEINFO, ref info, ref size) == unchecked((uint)-1)) continue;
            if (info.UsagePage != 0x0D || info.Usage != 0x05) continue;
            if (Describe(item.Device).Fingers.Count > 0) found++;
        }
        return found;
    }

    [DllImport("user32.dll", SetLastError = true)]
    static extern bool RegisterRawInputDevices(RAWINPUTDEVICE[] devices, uint count, uint size);
    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetRawInputData(IntPtr raw, uint command, IntPtr data, ref uint size, uint headerSize);
    [DllImport("user32.dll", SetLastError = true)]
    static extern uint GetRawInputDeviceInfo(IntPtr device, uint command, IntPtr data, ref uint size);
    [DllImport("hid.dll")]
    static extern int HidP_GetCaps(IntPtr preparsed, out HIDP_CAPS caps);
    [DllImport("hid.dll")]
    static extern int HidP_GetValueCaps(int reportType, [Out] HIDP_VALUE_CAPS[] caps, ref ushort length, IntPtr preparsed);
    [DllImport("hid.dll")]
    static extern int HidP_GetUsageValue(int reportType, ushort usagePage, ushort linkCollection, ushort usage, out uint value, IntPtr preparsed, byte[] report, uint length);
    [DllImport("hid.dll")]
    static extern int HidP_GetUsages(int reportType, ushort usagePage, ushort linkCollection, [Out] ushort[] usages, ref uint length, IntPtr preparsed, byte[] report, uint length2);

    /// <summary>One finger's fields in the report: its X and Y value ranges.</summary>
    class Finger { public ushort Link; public int XMin, XMax, YMin, YMax; }

    class Device { public IntPtr Preparsed; public List<Finger> Fingers = new List<Finger>(); }

    static readonly Dictionary<IntPtr, Device> devices = new Dictionary<IntPtr, Device>();
    static bool sizeSent, buttonDown;

    static Device Describe(IntPtr handle)
    {
        Device d;
        if (devices.TryGetValue(handle, out d)) return d;
        uint size = 0;
        GetRawInputDeviceInfo(handle, RIDI_PREPARSEDDATA, IntPtr.Zero, ref size);
        IntPtr pre = Marshal.AllocHGlobal((int)size);
        GetRawInputDeviceInfo(handle, RIDI_PREPARSEDDATA, pre, ref size);
        d = new Device { Preparsed = pre };
        HIDP_CAPS caps;
        HidP_GetCaps(pre, out caps);
        ushort n = caps.NumberInputValueCaps;
        var values = new HIDP_VALUE_CAPS[n];
        HidP_GetValueCaps(HidP_Input, values, ref n, pre);
        var byLink = new Dictionary<ushort, Finger>();
        double width = 0, height = 0;
        foreach (var v in values)
        {
            if (v.UsagePage != 0x01) continue; // Generic Desktop: X = 0x30, Y = 0x31
            ushort usage = v.UsageMin; // the Usage field when IsRange is 0
            if (usage != 0x30 && usage != 0x31) continue;
            Finger f;
            if (!byLink.TryGetValue(v.LinkCollection, out f)) byLink[v.LinkCollection] = f = new Finger { Link = v.LinkCollection };
            double physical = v.PhysicalMax - v.PhysicalMin;
            if (usage == 0x30) { f.XMin = v.LogicalMin; f.XMax = v.LogicalMax; width = physical > 0 ? physical : v.LogicalMax - v.LogicalMin; }
            else { f.YMin = v.LogicalMin; f.YMax = v.LogicalMax; height = physical > 0 ? physical : v.LogicalMax - v.LogicalMin; }
        }
        foreach (var f in byLink.Values) if (f.XMax > f.XMin && f.YMax > f.YMin) d.Fingers.Add(f);
        devices[handle] = d;
        if (!sizeSent && d.Fingers.Count > 0)
        {
            sizeSent = true;
            Console.WriteLine("size {0} {1}", width, height);
        }
        return d;
    }

    static void OnInput(IntPtr lParam)
    {
        uint headerSize = (uint)(8 + 2 * IntPtr.Size); // RAWINPUTHEADER
        uint size = 0;
        GetRawInputData(lParam, RID_INPUT, IntPtr.Zero, ref size, headerSize);
        IntPtr buffer = Marshal.AllocHGlobal((int)size);
        try
        {
            if (GetRawInputData(lParam, RID_INPUT, buffer, ref size, headerSize) != size) return;
            IntPtr device = Marshal.ReadIntPtr(buffer, 8);
            int hidSize = Marshal.ReadInt32(buffer, (int)headerSize);
            int count = Marshal.ReadInt32(buffer, (int)headerSize + 4);
            Device d = Describe(device);
            var report = new byte[hidSize];
            var usages = new ushort[32];
            for (int r = 0; r < count; r++)
            {
                Marshal.Copy(IntPtr.Add(buffer, (int)headerSize + 8 + r * hidSize), report, 0, hidSize);
                foreach (var f in d.Fingers)
                {
                    uint x, y, id;
                    if (HidP_GetUsageValue(HidP_Input, 0x01, f.Link, 0x30, out x, d.Preparsed, report, (uint)hidSize) != HIDP_STATUS_SUCCESS) continue;
                    if (HidP_GetUsageValue(HidP_Input, 0x01, f.Link, 0x31, out y, d.Preparsed, report, (uint)hidSize) != HIDP_STATUS_SUCCESS) continue;
                    if (HidP_GetUsageValue(HidP_Input, 0x0D, f.Link, 0x51, out id, d.Preparsed, report, (uint)hidSize) != HIDP_STATUS_SUCCESS) id = f.Link;
                    // Tip switch (Digitizer 0x42) is among the buttons pressed in this finger's collection.
                    uint n = (uint)usages.Length;
                    bool tip = false;
                    if (HidP_GetUsages(HidP_Input, 0x0D, f.Link, usages, ref n, d.Preparsed, report, (uint)hidSize) == HIDP_STATUS_SUCCESS)
                        for (int i = 0; i < n; i++) if (usages[i] == 0x42) tip = true;
                    Console.WriteLine("c {0} {1} {2:F4} {3:F4}", id, tip ? 1 : 0,
                        (x - f.XMin) / (double)(f.XMax - f.XMin), (y - f.YMin) / (double)(f.YMax - f.YMin));
                }
                // The pad's own button (Button page, button 1, top-level collection).
                uint bn = (uint)usages.Length;
                if (HidP_GetUsages(HidP_Input, 0x09, 0, usages, ref bn, d.Preparsed, report, (uint)hidSize) == HIDP_STATUS_SUCCESS)
                {
                    bool pressed = false;
                    for (int i = 0; i < bn; i++) if (usages[i] == 1) pressed = true;
                    if (pressed != buttonDown)
                    {
                        buttonDown = pressed;
                        Console.WriteLine("b {0}", pressed ? 1 : 0);
                    }
                }
            }
        }
        finally { Marshal.FreeHGlobal(buffer); }
    }

    class Sink : NativeWindow
    {
        public Sink() { CreateHandle(new CreateParams()); } // hidden: never shown
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_INPUT) OnInput(m.LParam);
            base.WndProc(ref m);
        }
    }

    [STAThread]
    static void Main()
    {
        Console.Out.Flush();
        var stdout = new System.IO.StreamWriter(Console.OpenStandardOutput()) { AutoFlush = true };
        Console.SetOut(stdout);
        if (FindTouchpads() == 0)
        {
            Console.WriteLine("err This computer has no Precision Touchpad");
            return;
        }
        var sink = new Sink();
        // Digitizer page, Touch Pad usage; INPUTSINK: also while the app, not this helper, has focus.
        var rid = new[] { new RAWINPUTDEVICE { UsagePage = 0x0D, Usage = 0x05, Flags = RIDEV_INPUTSINK, Target = sink.Handle } };
        if (!RegisterRawInputDevices(rid, 1, (uint)Marshal.SizeOf(typeof(RAWINPUTDEVICE))))
        {
            Console.WriteLine("err Couldn't register for touchpad input ({0})", Marshal.GetLastWin32Error());
            return;
        }
        // Stop when the app closes our stdin.
        new Thread(() => { while (Console.In.ReadLine() != null) { } Environment.Exit(0); }) { IsBackground = true }.Start();
        Application.Run();
    }
}
