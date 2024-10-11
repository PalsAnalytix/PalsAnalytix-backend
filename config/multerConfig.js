// // multerconfig.js
// const multer = require('multer');
// const path = require('path');

// // Define the storage options for multer
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/');  // Specify the directory for saving uploaded files
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
//   }
// });

// // Set file filter to only allow image uploads
// const fileFilter = (req, file, cb) => {
//   if (file.mimetype.startsWith('image/')) {
//     cb(null, true);
//   } else {
//     cb(new Error('Not an image! Please upload an image.'), false);
//   }
// };

// // Initialize the multer middleware
// const upload = multer({ 
//   storage: storage,
//   fileFilter: fileFilter
// });

// module.exports = upload;
