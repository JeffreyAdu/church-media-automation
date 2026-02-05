/**
 * Multer configuration for file uploads
 */

import multer from "multer";

// Store uploads in memory (we'll upload to Supabase, not disk)
const storage = multer.memoryStorage();

// File filter - only accept audio files
const audioFileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  const allowedMimes = [
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/m4a",
    "audio/x-m4a",
    "audio/wav",
    "audio/wave",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only audio files are allowed (mp3, m4a, wav)"));
  }
};

// File filter - only accept image files
const imageFileFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  const allowedMimes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpg, jpeg, png)"));
  }
};

export const upload = multer({
  storage,
  fileFilter: audioFileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
});

export const uploadImage = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size for images
  },
});
