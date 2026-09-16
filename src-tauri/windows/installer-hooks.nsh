; NSIS hooks for the Windows installer (see `bundle.windows.nsis.installerHooks`).
; They clean up after the rename from FlagCount to Audience Live.

!define LEGACY_PRODUCTNAME "FlagCount"
!define LEGACY_MAINBINARY "flagcount.exe"
!define LEGACY_SIDECAR "flagcount-sidecar.exe"

!macro NSIS_HOOK_PREINSTALL
  ; Versions before the rename run under the old executable names.
  !insertmacro CheckIfAppIsRunning "${LEGACY_MAINBINARY}" "${PRODUCTNAME}"
  !insertmacro CheckIfAppIsRunning "${LEGACY_SIDECAR}" "${PRODUCTNAME}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Push $R0

  ; Binaries left behind in this folder by versions before the rename.
  Delete "$INSTDIR\${LEGACY_MAINBINARY}"
  Delete "$INSTDIR\${LEGACY_SIDECAR}"

  ; Updates skip the start menu shortcut, so an update from FlagCount would
  ; leave Audience Live unfindable in Windows search.
  ${If} $NoShortcutMode <> 1
  ${AndIfNot} ${FileExists} "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    CreateShortcut "$SMPROGRAMS\${PRODUCTNAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
    !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${PRODUCTNAME}.lnk"
  ${EndIf}

  ; Remove the old FlagCount installation; settings live under the unchanged
  ; bundle identifier and are kept.
  ReadRegStr $R0 SHCTX "Software\${MANUFACTURER}\${LEGACY_PRODUCTNAME}" ""
  ${If} $R0 != ""
  ${AndIf} $R0 != $INSTDIR
    Delete "$R0\${LEGACY_MAINBINARY}"
    Delete "$R0\${LEGACY_SIDECAR}"
    Delete "$R0\uninstall.exe"
    RMDir "$R0"
  ${EndIf}
  Delete "$SMPROGRAMS\${LEGACY_PRODUCTNAME}.lnk"
  Delete "$DESKTOP\${LEGACY_PRODUCTNAME}.lnk"
  DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACY_PRODUCTNAME}"
  DeleteRegKey SHCTX "Software\${MANUFACTURER}\${LEGACY_PRODUCTNAME}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${LEGACY_PRODUCTNAME}"

  Pop $R0
!macroend
