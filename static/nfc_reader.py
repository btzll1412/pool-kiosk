import time
import sys
import requests
import pyautogui
from smartcard.System import readers
from smartcard.util import toHexString
from smartcard.CardMonitoring import CardMonitor, CardObserver

BACKEND_URL = "http://192.168.1.153"
DEBOUNCE_SECONDS = 2.0

class NFCObserver(CardObserver):
    def __init__(self):
        self.last_uid = None
        self.last_time = 0

    def update(self, observable, actions):
        added, removed = actions
        for card in added:
            try:
                conn = card.createConnection()
                conn.connect()
                response, sw1, sw2 = conn.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])
                if sw1 == 0x90:
                    uid = toHexString(response).replace(" ", "")
                    self._handle_uid(uid)
            except Exception as e:
                print(f"Error: {e}")

    def _handle_uid(self, uid):
        now = time.time()
        if uid == self.last_uid and (now - self.last_time) < DEBOUNCE_SECONDS:
            return
        self.last_uid = uid
        self.last_time = now
        print(f"Card: {uid}")
        time.sleep(0.05)
        pyautogui.typewrite(uid, interval=0.01)
        pyautogui.press("enter")
        try:
            requests.post(f"{BACKEND_URL}/api/nfc/broadcast", json={"uid": uid}, timeout=2)
        except:
            pass

if __name__ == "__main__":
    print("NFC Reader Starting...")
    r = readers()
    if not r:
        print("No readers found!")
        sys.exit(1)
    print(f"Using: {r[0]}")
    monitor = CardMonitor()
    monitor.addObserver(NFCObserver())
    print("Ready - tap a card...")
    while True:
        time.sleep(1)
