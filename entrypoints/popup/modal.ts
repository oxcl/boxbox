import { t } from '@/services/i18n';

export type ModalResult = { confirmed: false } | { confirmed: true; value?: string };
export type SupportAction = 'github' | 'rate' | 'donate' | 'not-interested';

export function showConfirm(message: string): Promise<ModalResult> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay')!;
    const title = document.getElementById('modal-title')!;
    const body = document.getElementById('modal-body')!;
    const cancelBtn = document.getElementById('modal-cancel')!;
    const confirmBtn = document.getElementById('modal-confirm')!;

    title.textContent = t('confirm');
    body.textContent = message;
    overlay.classList.remove('hidden');

    function cleanup() {
      overlay.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
    }

    function onCancel() {
      cleanup();
      resolve({ confirmed: false });
    }
    function onConfirm() {
      cleanup();
      resolve({ confirmed: true });
    }
    function onOverlayClick(e: MouseEvent) {
      if (e.target === overlay) {
        cleanup();
        resolve({ confirmed: false });
      }
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cleanup();
        resolve({ confirmed: false });
      }
    }

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
  });
}

export function showPrompt(defaultValue: string, promptTitle?: string): Promise<ModalResult> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-overlay')!;
    const title = document.getElementById('modal-title')!;
    const body = document.getElementById('modal-body')!;
    const cancelBtn = document.getElementById('modal-cancel')!;
    const confirmBtn = document.getElementById('modal-confirm')!;

    title.textContent = promptTitle ?? t('renameAccount');
    body.replaceChildren();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultValue;
    body.appendChild(input);
    overlay.classList.remove('hidden');
    input.focus();
    input.select();

    function cleanup() {
      overlay.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      input.removeEventListener('keydown', onInputKeydown);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
    }

    function onCancel() {
      cleanup();
      resolve({ confirmed: false });
    }
    function onConfirm() {
      cleanup();
      resolve({ confirmed: true, value: input.value });
    }
    function onInputKeydown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        cleanup();
        resolve({ confirmed: true, value: input.value });
      }
    }
    function onOverlayClick(e: MouseEvent) {
      if (e.target === overlay) {
        cleanup();
        resolve({ confirmed: false });
      }
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cleanup();
        resolve({ confirmed: false });
      }
    }

    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    input.addEventListener('keydown', onInputKeydown);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
  });
}

export function showSupportModal(): Promise<SupportAction> {
  return new Promise((resolve) => {
    const overlay = document.getElementById('support-modal-overlay')!;
    const buttons = overlay.querySelectorAll<HTMLButtonElement>('.support-btn');
    const dismissBtn = overlay.querySelector<HTMLButtonElement>('.support-dismiss-btn')!;

    overlay.classList.remove('hidden');

    function cleanup() {
      overlay.classList.add('hidden');
      for (const btn of buttons) {
        btn.removeEventListener('click', onBtnClick);
      }
      dismissBtn.removeEventListener('click', onDismiss);
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onKeydown);
    }

    function onBtnClick(e: Event) {
      const btn = e.currentTarget as HTMLElement;
      const action = btn.dataset.action as SupportAction;
      cleanup();
      resolve(action);
    }

    function onDismiss() {
      cleanup();
      resolve('not-interested');
    }

    function onOverlayClick(e: MouseEvent) {
      if (e.target === overlay) {
        cleanup();
        resolve('not-interested');
      }
    }

    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        cleanup();
        resolve('not-interested');
      }
    }

    for (const btn of buttons) {
      btn.addEventListener('click', onBtnClick);
    }
    dismissBtn.addEventListener('click', onDismiss);
    overlay.addEventListener('click', onOverlayClick);
    document.addEventListener('keydown', onKeydown);
  });
}
