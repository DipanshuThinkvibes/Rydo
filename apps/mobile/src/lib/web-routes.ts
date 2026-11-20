import type { Href } from 'expo-router';

/** Web page → app screen, for links the API gives with web paths (highlights, notifications). */
const MAP: Record<string, string> = {
  '/ride': '/plan',
  '/ops': '/manage/rides',
  '/employees': '/manage/employees',
  '/drivers': '/manage/drivers',
  '/company': '/manage/company',
  '/structure': '/manage/structure',
  '/reports': '/manage/reports',
  '/activity': '/manage/activity',
};

export function appHref(web: string): Href {
  const [path, query] = web.split('?');
  const mapped = MAP[path] ?? path;
  return (query ? `${mapped}?${query}` : mapped) as Href;
}
