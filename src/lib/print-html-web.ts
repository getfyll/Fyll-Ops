// expo-print's Print.printAsync({ html }) is unreliable on web — on some mobile browsers
// (observed on iOS Safari) it ignores the html/uri options entirely and prints the current
// page instead. Loading the html into a detached iframe and calling print() on that iframe's
// window is the one technique that reliably prints exactly the given content on every browser.
export const printHtmlOnWeb = async (html: string): Promise<void> => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.left = '-10000px';
  frame.style.top = '0';
  frame.style.width = '360px';
  frame.style.height = '420px';
  frame.style.border = '0';
  document.body.appendChild(frame);

  const frameWindow = frame.contentWindow;
  const frameDocument = frame.contentDocument || frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    frame.remove();
    return;
  }

  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();

  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 250);
  });

  frameWindow.focus();
  frameWindow.print();

  window.setTimeout(() => {
    frame.remove();
  }, 1000);
};
