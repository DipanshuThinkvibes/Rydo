import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from './dialog';

/** A photo picked from the camera or the gallery, ready for a multipart upload. */
export interface Picked {
  uri: string;
  name: string;
  type: string;
}

export async function pick(fromCamera: boolean): Promise<Picked | null> {
  const perm = fromCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert('Permission needed', fromCamera ? 'Allow camera access to take a photo of the document.' : 'Allow photo access to choose the document.');
    return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6 };
  const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const type = a.mimeType ?? 'image/jpeg';
  return { uri: a.uri, type, name: a.fileName ?? `document.${type.split('/')[1] ?? 'jpg'}` };
}

/** Adds a picked file to a FormData (React Native wants { uri, name, type }; the web wants a Blob). */
export async function appendFile(form: FormData, field: string, file: Picked) {
  if (Platform.OS === 'web') form.append(field, await (await fetch(file.uri)).blob(), file.name);
  else form.append(field, file as unknown as Blob);
}
