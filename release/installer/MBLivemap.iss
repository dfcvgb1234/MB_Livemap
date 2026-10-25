; Build with release\BuildRelease.ps1, which calls ISCC when Inno Setup 6 is installed.
; The portable folder in release\out works without this installer.

#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif

[Setup]
AppId={{A7B3E1C4-6D28-4F0A-9C55-1E8B4D2F7A90}
AppName=MB Livemap
AppVersion={#MyAppVersion}
AppPublisher=MB Livemap
DefaultDirName={localappdata}\MB Livemap
DefaultGroupName=MB Livemap
DisableProgramGroupPage=yes
OutputDir=..\out
OutputBaseFilename=MB-Livemap-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
#ifexist "..\out\MB Livemap\icon.ico"
SetupIconFile="..\out\MB Livemap\icon.ico"
#endif
UninstallDisplayIcon={app}\MB Livemap.exe

[Files]
Source: "..\out\MB Livemap\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\MB Livemap"; Filename: "{app}\MB Livemap.exe"
Name: "{group}\Stop MB Livemap"; Filename: "{app}\Stop MB Livemap.bat"
Name: "{autodesktop}\MB Livemap"; Filename: "{app}\MB Livemap.exe"

[Run]
Filename: "{app}\MB Livemap.exe"; Description: "Start MB Livemap"; Flags: postinstall nowait skipifsilent
