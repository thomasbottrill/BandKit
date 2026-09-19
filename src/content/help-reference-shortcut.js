const COMMAND = "components";
const KEY_TIMEOUT = 2000;

export function createHelpReferenceShortcut({ getHelpCard, onOpen, now = Date.now }) {
  let card = null;
  let prefix = "";
  let lastKeyAt = 0;
  return event => {
    const currentCard = getHelpCard();
    const time = now();
    if (currentCard !== card || time - lastKeyAt > KEY_TIMEOUT) prefix = "";
    card = currentCard;
    const editing = event.composedPath().some(node => node.isContentEditable
      || node.matches?.("input, textarea, select, [role='textbox']"));
    if (!card || editing || event.defaultPrevented || event.isComposing || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      prefix = "";
      return;
    }
    const key = event.key.toLowerCase();
    prefix = COMMAND.startsWith(prefix + key) ? prefix + key : key === COMMAND[0] ? key : "";
    lastKeyAt = time;
    if (!prefix) return;
    event.preventDefault();
    event.stopPropagation();
    if (prefix === COMMAND) {
      prefix = "";
      onOpen();
    }
  };
}
