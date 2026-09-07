const express = require("express");
const upload = require("../config/s3Config");
const router = express.Router();

router.post("/image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }
    res.status(200).json({ url: req.file.location });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
