export interface MidtransSnapCallbacks {
  onSuccess?: (result: unknown) => void;
  onPending?: (result: unknown) => void;
  onError?: (result: unknown) => void;
  onClose?: () => void;
}

export interface MidtransSnap {
  pay: (token: string, callbacks?: MidtransSnapCallbacks) => void;
}

declare global {
  interface Window {
    snap?: MidtransSnap;
  }
}

export {};
