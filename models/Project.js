const mongoose = require("mongoose");

const ProjectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true, maxlength: 80 },
    location: { type: String, required: true, trim: true, maxlength: 120 },
    year: { type: Number, min: 1900, max: 2100, default: null },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    image: { type: String, required: true, trim: true, maxlength: 500 },
    galleryImages: {
      type: [String],
      default: [],
      validate: [(images) => images.length <= 20, "A project can have at most 20 gallery images."],
    },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Project", ProjectSchema);
