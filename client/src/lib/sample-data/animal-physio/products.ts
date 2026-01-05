/**
 * Sample animal physiotherapy product/service data
 * Common treatments and services for animal physiotherapy practice
 */

export const animalPhysioProducts = [
  {
    name: "Initial Consultation & Assessment",
    category: "Consultation",
    unitPrice: 85.00,
    status: "active" as const,
    description: "Comprehensive initial assessment including gait analysis, palpation, and treatment plan development",
  },
  {
    name: "Equine Physiotherapy Session",
    category: "Treatment",
    unitPrice: 65.00,
    status: "active" as const,
    description: "60-minute treatment session including manual therapy, therapeutic exercises, and stretching",
  },
  {
    name: "Canine Physiotherapy Session",
    category: "Treatment",
    unitPrice: 55.00,
    status: "active" as const,
    description: "45-minute treatment session for dogs including massage, joint mobilization, and rehabilitation exercises",
  },
  {
    name: "Hydrotherapy Session - Underwater Treadmill",
    category: "Hydrotherapy",
    unitPrice: 45.00,
    status: "active" as const,
    description: "30-minute underwater treadmill session for rehabilitation and conditioning",
  },
  {
    name: "Hydrotherapy Session - Swimming Pool",
    category: "Hydrotherapy",
    unitPrice: 40.00,
    status: "active" as const,
    description: "25-minute swimming session with qualified handler for strength and cardiovascular fitness",
  },
  {
    name: "Electrotherapy Treatment",
    category: "Treatment",
    unitPrice: 35.00,
    status: "active" as const,
    description: "TENS, ultrasound, or laser therapy for pain relief and tissue healing (add-on to standard session)",
  },
  {
    name: "Post-Operative Rehabilitation Package",
    category: "Package",
    unitPrice: 450.00,
    status: "active" as const,
    description: "6-week program including initial assessment and 8 treatment sessions for surgical recovery",
  },
  {
    name: "Performance Enhancement Program",
    category: "Package",
    unitPrice: 550.00,
    status: "active" as const,
    description: "8-week conditioning program for competition animals including gait analysis, strength training, and progress monitoring",
  },
  {
    name: "Home Visit Fee",
    category: "Travel",
    unitPrice: 25.00,
    status: "active" as const,
    description: "Additional charge for treatments conducted at client's location (within 15 miles)",
  },
  {
    name: "Kinesiology Taping",
    category: "Treatment",
    unitPrice: 20.00,
    status: "active" as const,
    description: "Therapeutic taping for support, pain relief, and proprioception (add-on to standard session)",
  },
];
