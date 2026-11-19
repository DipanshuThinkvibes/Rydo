import { Alert as NativeAlert, Platform, type AlertButton } from 'react-native';

/**
 * Drop-in for React Native's Alert.alert that also works in the Expo web preview
 * (react-native-web's Alert does nothing, so confirm dialogs and "Sign out" silently failed there).
 * On the web, each non-cancel button is offered in turn with the browser's confirm box.
 */
function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') return NativeAlert.alert(title, message, buttons);
  const text = message ? `${title}\n\n${message}` : title;
  const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
  if (actions.length === 0) {
    window.alert(text);
    (buttons ?? [])[0]?.onPress?.();
    return;
  }
  if (actions.length === 1) {
    if (window.confirm(`${text}\n\nOK = ${actions[0].text ?? 'OK'}`)) actions[0].onPress?.();
    return;
  }
  for (const b of actions) {
    if (window.confirm(`${text}\n\nOK = ${b.text ?? 'OK'}\nCancel = other choices`)) {
      b.onPress?.();
      return;
    }
  }
}

export const Alert = { alert };
