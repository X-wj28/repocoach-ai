Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"

!ifndef APP_VERSION
  !define APP_VERSION "1.0.0"
!endif
!ifndef BUILD_DIR
  !error "BUILD_DIR is required"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE is required"
!endif
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\RepoCoach"

Name "RepoCoach"
OutFile "${OUTPUT_FILE}"
InstallDir "$LOCALAPPDATA\Programs\RepoCoach"
InstallDirRegKey HKCU "Software\RepoCoach" "InstallPath"
RequestExecutionLevel user
SetCompressor /SOLID lzma
BrandingText "RepoCoach · FE INTERVIEW LAB"
Icon "assets\repocoach.ico"
UninstallIcon "assets\repocoach.ico"
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey /LANG=2052 "ProductName" "RepoCoach"
VIAddVersionKey /LANG=2052 "FileDescription" "RepoCoach 安装程序"
VIAddVersionKey /LANG=2052 "FileVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "ProductVersion" "${APP_VERSION}"
VIAddVersionKey /LANG=2052 "LegalCopyright" "MIT License - RepoCoach"

Var NoShortcuts
Var Parameters

!define MUI_ABORTWARNING
!define MUI_ICON "assets\repocoach.ico"
!define MUI_UNICON "assets\repocoach.ico"
!define MUI_WELCOMEPAGE_TITLE "欢迎安装 RepoCoach"
!define MUI_WELCOMEPAGE_TEXT "FE INTERVIEW LAB$\r$\n$\r$\n把代码证据驱动的面试训练工作台放到桌面。$\r$\n$\r$\n安装后双击 RepoCoach 图标即可使用，需保持联网。$\r$\n无需配置数据库或模型密钥。"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_TITLE "RepoCoach 已安装"
!define MUI_FINISHPAGE_TEXT "现在可以从桌面或开始菜单打开 RepoCoach。$\r$\n$\r$\n首次访问免费服务可能需要等待几十秒唤醒。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\RepoCoach.exe"
!define MUI_FINISHPAGE_RUN_TEXT "打开 RepoCoach"
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH
!insertmacro MUI_LANGUAGE "SimpChinese"

Function .onInit
  SetShellVarContext current
  ${GetParameters} $Parameters
  ${GetOptions} $Parameters "/NOSHORTCUTS" $NoShortcuts
  ${IfNot} ${Errors}
    StrCpy $NoShortcuts "1"
  ${EndIf}
FunctionEnd

Section "RepoCoach" SEC_MAIN
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File "${BUILD_DIR}\RepoCoach.exe"
  File "assets\repocoach.ico"
  File /oname=README.txt "README.txt"
  File /oname=LICENSE.txt "..\..\LICENSE"
  File /oname=THIRD-PARTY-NOTICES.txt "THIRD-PARTY-NOTICES.txt"
  WriteUninstaller "$INSTDIR\Uninstall.exe"
  WriteRegStr HKCU "Software\RepoCoach" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayName" "RepoCoach"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "Publisher" "RepoCoach"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\RepoCoach.exe,0"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "URLInfoAbout" "https://github.com/X-wj28/repocoach-ai"
  WriteRegStr HKCU "${UNINSTALL_KEY}" "UninstallString" '$\"$INSTDIR\Uninstall.exe$\"'
  WriteRegStr HKCU "${UNINSTALL_KEY}" "QuietUninstallString" '$\"$INSTDIR\Uninstall.exe$\" /S'
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  WriteRegDWORD HKCU "${UNINSTALL_KEY}" "EstimatedSize" $0
  ${If} $NoShortcuts != "1"
    CreateShortcut "$DESKTOP\RepoCoach.lnk" "$INSTDIR\RepoCoach.exe" "" "$INSTDIR\repocoach.ico" 0 SW_SHOWNORMAL "" "RepoCoach - FE INTERVIEW LAB"
    CreateDirectory "$SMPROGRAMS\RepoCoach"
    CreateShortcut "$SMPROGRAMS\RepoCoach\RepoCoach.lnk" "$INSTDIR\RepoCoach.exe" "" "$INSTDIR\repocoach.ico" 0 SW_SHOWNORMAL "" "RepoCoach - FE INTERVIEW LAB"
    CreateShortcut "$SMPROGRAMS\RepoCoach\卸载 RepoCoach.lnk" "$INSTDIR\Uninstall.exe"
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  ; Remove only shortcuts still owned by this installation.
  ReadRegStr $0 HKCU "Software\RepoCoach" "InstallPath"
  ${If} $0 == $INSTDIR
    Delete "$DESKTOP\RepoCoach.lnk"
    Delete "$SMPROGRAMS\RepoCoach\RepoCoach.lnk"
    Delete "$SMPROGRAMS\RepoCoach\卸载 RepoCoach.lnk"
    RMDir "$SMPROGRAMS\RepoCoach"
    DeleteRegKey HKCU "${UNINSTALL_KEY}"
    DeleteRegKey HKCU "Software\RepoCoach"
  ${EndIf}
  ; Deliberately avoid recursive deletion: retain any user-created files.
  Delete "$INSTDIR\RepoCoach.exe"
  Delete "$INSTDIR\repocoach.ico"
  Delete "$INSTDIR\README.txt"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\THIRD-PARTY-NOTICES.txt"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
SectionEnd
