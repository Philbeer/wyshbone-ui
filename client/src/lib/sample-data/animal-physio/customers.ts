/**
 * Sample animal physiotherapy customer data
 * Realistic animal owners and facilities in the UK
 */

export const animalPhysioCustomers = [
  {
    name: "Oakridge Equestrian Centre",
    addressLine1: "Stable Block, Manor Farm",
    city: "Newmarket",
    postcode: "CB8 7AA",
    accountStatus: "active" as const,
    deliveryNotes: "Yard office hours: 7am-6pm. Ring bell at main gate.",
  },
  {
    name: "Mrs. Sarah Thompson",
    addressLine1: "15 Meadow Lane",
    city: "Cheltenham",
    postcode: "GL50 3PR",
    accountStatus: "active" as const,
    deliveryNotes: "Private client - Competition dressage horse. Prefer afternoon appointments.",
  },
  {
    name: "Riverside Veterinary Hospital",
    addressLine1: "22 High Street",
    city: "Oxford",
    postcode: "OX1 4AP",
    accountStatus: "active" as const,
    deliveryNotes: "Referral partner. Contact reception for appointment coordination.",
  },
  {
    name: "Mr. James Morrison",
    addressLine1: "The Kennels, Woodland Estate",
    city: "Cirencester",
    postcode: "GL7 5QD",
    accountStatus: "active" as const,
    deliveryNotes: "Working gun dogs. Access via farm entrance, call ahead.",
  },
  {
    name: "Greenfield Racing Stables",
    addressLine1: "Training Grounds, Racecourse Road",
    city: "Lambourn",
    postcode: "RG17 8QS",
    accountStatus: "on_hold" as const,
    deliveryNotes: "Account on hold - Payment terms under review.",
  },
];
