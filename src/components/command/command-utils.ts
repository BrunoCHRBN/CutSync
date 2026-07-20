export interface CommandTargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

export const isEditableCommandTarget = (target: EventTarget | CommandTargetLike | null) => {
  const element = target as CommandTargetLike | null;
  if (!element) return false;
  const tag = element.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(element.isContentEditable);
};
