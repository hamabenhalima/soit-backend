require("dotenv").config();

const mongoose = require("mongoose");
const Project = require("../models/Project");

const initialProjects = [
  {
    title: "Aménagement Siliana El Jadida",
    category: "Lotissement VRD",
    location: "Siliana, Tunisie",
    year: null,
    description: "Travaux d'aménagement et de réseaux divers pour le nouveau lotissement.",
    image: "images/current-project/8.jpg",
    galleryImages: [
      "images/current-project/1.jpg",
      "images/current-project/2.jpeg",
      "images/current-project/3.jpeg",
    ],
    isPublished: true,
  },
  {
    title: "Entrée de la ville, Souk Jdid",
    category: "Aménagement urbain",
    location: "Sidi Bouzid, Tunisie",
    year: null,
    description: "Embellissement de l'entrée de Souk Jdid, dans le gouvernorat de Sidi Bouzid.",
    image: "images/projets/souk-jdid/1.jpg",
    galleryImages: Array.from({ length: 11 }, (_, index) => `images/projets/souk-jdid/${index + 2}.jpg`),
    isPublished: true,
  },
  {
    title: "Travaux de voirie",
    category: "Infrastructures routières",
    location: "Tunisie",
    year: null,
    description: "Préparation et revêtement d'une chaussée, photographiés sur le chantier.",
    image: "images/chantier-routier.jpg",
    galleryImages: [],
    isPublished: true,
  },
];

async function seedProjects() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing.");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });

  let added = 0;
  for (const project of initialProjects) {
    const existing = await Project.findOne({ title: project.title }).select("_id").lean();
    if (existing) continue;
    await Project.create(project);
    added += 1;
  }
  console.log(`Project setup complete. Added ${added} existing portfolio project(s); existing entries were left unchanged.`);
}

seedProjects()
  .catch((error) => {
    console.error("Project setup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
