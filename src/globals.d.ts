// The BibleGateway Reference Tagging Tool is loaded by a plain <script> tag in
// index.html, so it arrives on `window` with no module of its own. See the
// comment in index.html for why it is there.
interface Window {
  BGLinks?: { linkVerses: () => void };
}
