import { KEY } from "./_lib.js";
export default (req, res) => res.status(200).json({ claude: !!KEY });
