import { useEffect, useRef, useState } from "react";

export default function ScreenTransition({ screen, children }) {
  const [displayed, setDisplayed] = useState(children);
  const [animating, setAnimating] = useState(false);
  const prevScreen = useRef(screen);

  useEffect(() => {
    if (screen !== prevScreen.current) {
      setAnimating(true);
      const timer = setTimeout(() => {
        setDisplayed(children);
        setAnimating(false);
        prevScreen.current = screen;
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setDisplayed(children);
    }
  }, [screen, children]);

  return (
    <div
      className={`flex-1 transition-opacity duration-150 ease-in-out ${
        animating ? "opacity-0" : "opacity-100"
      }`}
    >
      {displayed}
    </div>
  );
}
