import { useEffect, useRef, useState } from "react";
import Keyboard from "react-simple-keyboard";
import "react-simple-keyboard/build/css/index.css";

// Dispatch custom activity event to reset inactivity timer
const signalActivity = () => {
  window.dispatchEvent(new CustomEvent("kiosk-activity"));
};

export default function VirtualKeyboard({ value, onChange, onClose }) {
  const keyboardRef = useRef(null);
  const [layoutName, setLayoutName] = useState("default");

  useEffect(() => {
    if (keyboardRef.current) {
      keyboardRef.current.setInput(value || "");
    }
  }, [value]);

  const handleChange = (input) => {
    signalActivity();
    onChange(input);
  };

  const handleKeyPress = (button) => {
    signalActivity();
    if (button === "{enter}") {
      onClose?.();
    } else if (button === "{shift}" || button === "{lock}") {
      setLayoutName(layoutName === "default" ? "shift" : "default");
    }
  };

  const layouts = {
    default: [
      "1 2 3 4 5 6 7 8 9 0 {bksp}",
      "q w e r t y u i o p",
      "a s d f g h j k l",
      "{shift} z x c v b n m {shift}",
      "{space} {enter}",
    ],
    shift: [
      "! @ # $ % ^ & * ( ) {bksp}",
      "Q W E R T Y U I O P",
      "A S D F G H J K L",
      "{shift} Z X C V B N M {shift}",
      "{space} {enter}",
    ],
  };

  const display = {
    "{bksp}": "⌫",
    "{enter}": "Done",
    "{space}": "Space",
    "{shift}": layoutName === "default" ? "⇧ ABC" : "⇧ abc",
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 bg-gray-100 p-4 shadow-2xl">
      <div className="mx-auto max-w-2xl">
        <Keyboard
          keyboardRef={(r) => (keyboardRef.current = r)}
          layout={layouts}
          layoutName={layoutName}
          onChange={handleChange}
          onKeyPress={handleKeyPress}
          display={display}
          theme="hg-theme-default hg-layout-default kiosk-keyboard"
          buttonTheme={[
            {
              class: "keyboard-key-large",
              buttons: "1 2 3 4 5 6 7 8 9 0 q w e r t y u i o p a s d f g h j k l z x c v b n m Q W E R T Y U I O P A S D F G H J K L Z X C V B N M ! @ # $ % ^ & * ( )",
            },
            {
              class: "keyboard-key-action",
              buttons: "{bksp} {enter} {space} {shift}",
            },
          ]}
        />
      </div>
    </div>
  );
}
