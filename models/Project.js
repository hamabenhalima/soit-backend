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
    isCurrent: { type: Boolean, default: false },
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },
    currentStage: {
      type: String,
      trim: true,
      enum: ["", "Étude", "Terrassement", "VRD", "Voirie", "Espaces verts", "Livraison"],
      default: "",
    },
    latestUpdate: { type: String, trim: true, maxlength: 500, default: "" },
    latestUpdateEn: { type: String, trim: true, maxlength: 500, default: "" },
    latestUpdateAr: { type: String, trim: true, maxlength: 500, default: "" },
    latestUpdateAt: { type: Date, default: null },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Project", ProjectSchema);
