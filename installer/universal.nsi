Unicode true

!include "LogicLib.nsh"
!include "x64.nsh"

!ifndef VERSION
  !error "VERSION must be provided"
!endif
!ifndef X64_INSTALLER
  !error "X64_INSTALLER must be provided"
!endif
!ifndef ARM64_INSTALLER
  !error "ARM64_INSTALLER must be provided"
!endif
!ifndef OUTPUT_FILE
  !error "OUTPUT_FILE must be provided"
!endif
!ifndef ICON_FILE
  !error "ICON_FILE must be provided"
!endif

Name "Remind Me"
OutFile "${OUTPUT_FILE}"
Icon "${ICON_FILE}"
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
ShowInstDetails nevershow

VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Remind Me"
VIAddVersionKey /LANG=1033 "FileDescription" "Remind Me universal Windows installer"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=1033 "CompanyName" "Fishcake Software"
VIAddVersionKey /LANG=1033 "LegalCopyright" "Copyright (c) 2026 Fishcake Software"

Section
  InitPluginsDir

  ${If} ${IsNativeARM64}
    File /oname=$PLUGINSDIR\Remind-Me-native-setup.exe "${ARM64_INSTALLER}"
  ${ElseIf} ${IsNativeAMD64}
    File /oname=$PLUGINSDIR\Remind-Me-native-setup.exe "${X64_INSTALLER}"
  ${Else}
    MessageBox MB_OK|MB_ICONSTOP "Remind Me requires 64-bit Windows on an x64 or ARM64 computer."
    SetErrorLevel 1633
    Quit
  ${EndIf}

  ExecWait '"$PLUGINSDIR\Remind-Me-native-setup.exe"' $0
  SetErrorLevel $0
SectionEnd
