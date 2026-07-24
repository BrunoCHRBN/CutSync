export type ClientHapticEvent =
  | 'selection'
  | 'success'
  | 'warning'
  | 'error'
  | 'toggle-on'
  | 'toggle-off';

export type ClientHapticPlatform = 'android' | 'ios' | 'web';

export type ClientHapticPattern =
  | 'segment-tick'
  | 'confirm'
  | 'reject'
  | 'toggle-on'
  | 'toggle-off'
  | 'selection'
  | 'success'
  | 'warning'
  | 'error'
  | 'none';

export function resolveClientHapticPattern(
  event: ClientHapticEvent,
  platform: ClientHapticPlatform,
): ClientHapticPattern {
  if (platform === 'web') return 'none';

  if (platform === 'android') {
    if (event === 'selection') return 'segment-tick';
    if (event === 'success') return 'confirm';
    if (event === 'warning' || event === 'error') return 'reject';
    return event;
  }

  return event;
}
