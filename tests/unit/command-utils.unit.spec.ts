import { expect, test } from '@playwright/test';
import { isEditableCommandTarget } from '../../src/components/command/command-utils';

test('bloqueia atalhos de uma tecla em campos editáveis', () => {
  expect(isEditableCommandTarget({ tagName: 'INPUT' })).toBe(true);
  expect(isEditableCommandTarget({ tagName: 'textarea' })).toBe(true);
  expect(isEditableCommandTarget({ tagName: 'SELECT' })).toBe(true);
  expect(isEditableCommandTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  expect(isEditableCommandTarget({ tagName: 'BUTTON' })).toBe(false);
  expect(isEditableCommandTarget(null)).toBe(false);
});
