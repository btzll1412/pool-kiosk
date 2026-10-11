import { useEffect, useRef, useState } from "react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";

// Dispatch custom activity event to reset inactivity timer
const signalActivity = () => {
  window.dispatchEvent(new CustomEvent("kiosk-activity"));
};

// Close a keyboard nobody has touched for a while, so a wedged keyboard can never
// block the field for good — the next tap on the field opens a fresh one.
const IDLE_CLOSE_MS = 60_000;

// Touch screens fire both touch and emulated mouse events; feeding the keyboard
// both is what leaves it stuck. Pick one input model for the device we're on.
const IS_TOUCH_DEVICE =
  typeof window !== "undefined" &&
  (window.matchMedia?.("(pointer: coarse)").matches || "ontouchstart" in window);

const LAYOUTS = {
  default: [
    "1 2 3 4 5 6 7 8 9 0 {bksp}",
    "q w e r t y u i o p",
    "a s d f g h j k l @",
    "{shift} z x c v b n m . - _ {shift}",
    "{space}",
  ],
  shift: [
    "! # $ % ^ & * ( ) ' {bksp}",
    "Q W E R T Y U I O P",
    "A S D F G H J K L @",
    "{shift} Z X C V B N M , - _ {shift}",
    "{space}",
  ],
  email: [
    "1 2 3 4 5 6 7 8 9 0 {bksp}",
    "q w e r t y u i o p",
    "a s d f g h j k l @",
    "{shift} z x c v b n m . - _ {shift}",
    "{at} {dot} {dotcom} {space}",
  ],
  emailShift: [
    "! # $ % ^ & * ( ) ' {bksp}",
    "Q W E R T Y U I O P",
    "A S D F G H J K L @",
    "{shift} Z X C V B N M . - _ {shift}",
    "{at} {dot} {dotcom} {space}",
  ],
};

const SHIFT_PAIRS = { default: "shift", shift: "default", email: "emailShift", emailShift: "email" };
const INSERT_KEYS = { "{at}": "@", "{dot}": ".", "{dotcom}": ".com" };

export default function VirtualKeyboard({ value, onChange, onClose, onNext, layoutType = "default" }) {
  const keyboardRef = useRef(null);
  const idleTimer = useRef(null);
  const [layoutName, setLayoutName] = useState(layoutType === "email" ? "email" : "default");
  const shifted = layoutName === "shift" || layoutName === "emailShift";

  // The field is the single source of truth; keep the keyboard's copy in step with it
  useEffect(() => {
    keyboardRef.current?.setInput(value || "");
  }, [value]);

  const armIdleClose = () => {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => onClose?.(), IDLE_CLOSE_MS);
  };

  useEffect(() => {
    armIdleClose();
    return () => clearTimeout(idleTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const touched = () => {
    signalActivity();
    armIdleClose();
  };

  const handleChange = (input) => {
    touched();
    onChange(input);
  };

  const handleKeyPress = (button) => {
    touched();
    if (button === "{enter}") {
      onClose?.();
    } else if (button === "{next}") {
      onNext?.();
    } else if (button === "{shift}" || button === "{lock}") {
      setLayoutName(SHIFT_PAIRS[layoutName]);
    } else if (INSERT_KEYS[button]) {
      const next = (value || "") + INSERT_KEYS[button];
      keyboardRef.current?.setInput(next);
      onChange(next);
    }
  };

  const display = {
    "{bksp}": "⌫",
    "{enter}": "Done",
    "{next}": "Next ▶",
    "{space}": "Space",
    "{shift}": shifted ? "⇧ abc" : "⇧ ABC",
    "{at}": "@",
    "{dot}": ".",
    "{dotcom}": ".com",
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-100 p-4 shadow-2xl">
      <div className="mx-auto max-w-3xl flex gap-3">
        <div className="flex-1">
          <Keyboard
            keyboardRef={(r) => (keyboardRef.current = r)}
            layout={LAYOUTS}
            layoutName={layoutName}
            onChange={handleChange}
            onKeyPress={handleKeyPress}
            display={display}
            useTouchEvents={IS_TOUCH_DEVICE}
            useMouseEvents={!IS_TOUCH_DEVICE}
            disableCaretPositioning
            preventMouseDownDefault
            theme="hg-theme-default hg-layout-default kiosk-keyboard"
            buttonTheme={[
              {
                class: "keyboard-key-large",
                buttons: "1 2 3 4 5 6 7 8 9 0 q w e r t y u i o p a s d f g h j k l z x c v b n m Q W E R T Y U I O P A S D F G H J K L Z X C V B N M ! @ # $ % ^ & * ( ) . , - _ '",
              },
              {
                class: "keyboard-key-action",
                buttons: "{bksp} {enter} {space} {shift} {at} {dot} {dotcom}",
              },
            ]}
          />
        </div>
        <div className="flex flex-col gap-2 w-24">
          <button
            type="button"
            onClick={() => { touched(); onNext?.(); }}
            className="flex-1 rounded-xl bg-brand-600 text-white font-bold text-lg transition-all hover:bg-brand-700 active:scale-95"
          >
            Next ▶
          </button>
          <button
            type="button"
            onClick={() => { signalActivity(); onClose?.(); }}
            className="flex-1 rounded-xl bg-gray-300 text-gray-700 font-bold text-lg transition-all hover:bg-gray-400 active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
