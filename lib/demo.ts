export type Status =
  | "Submitted"
  | "Under Review"
  | "Verified"
  | "Assigned"
  | "In Progress"
  | "Resolved";
export type Incident = {
  id: string;
  title: string;
  area: string;
  category: string;
  priority: "High" | "Medium" | "Low";
  status: Status;
  coordinates: [number, number];
  description: string;
  history: string[];
  mapVisible?: boolean;
};
export const statuses: Status[] = [
  "Submitted",
  "Under Review",
  "Verified",
  "Assigned",
  "In Progress",
  "Resolved",
];
const featuredDemoIncidents: Incident[] = [
  {
    id: "AF-001",
    title: "Blocked Drain — Kaneshie",
    area: "Kaneshie",
    category: "Blockage",
    priority: "High",
    status: "Verified",
    coordinates: [-0.247, 5.572],
    description:
      "Illustrative report of accumulated debris at a roadside drain. This location and observation are synthetic.",
    history: ["Submitted · DEMO", "Under Review · DEMO", "Verified · DEMO"],
  },
  {
    id: "AF-002",
    title: "Standing water near junction",
    area: "Adabraka",
    category: "Flooding",
    priority: "High",
    status: "Under Review",
    coordinates: [-0.211, 5.565],
    description:
      "Synthetic report awaiting review. No actual flooding has been confirmed.",
    history: ["Submitted · DEMO", "Under Review · DEMO"],
  },
  {
    id: "AF-003",
    title: "Culvert inspection required",
    area: "Dzorwulu",
    category: "Damaged culvert",
    priority: "Medium",
    status: "Assigned",
    coordinates: [-0.204, 5.613],
    description:
      "Illustrative inspection request for demonstrating maintenance workflows.",
    history: [
      "Submitted · DEMO",
      "Under Review · DEMO",
      "Verified · DEMO",
      "Assigned · DEMO",
    ],
  },
  {
    id: "AF-004",
    title: "Debris removal completed",
    area: "Osu",
    category: "Debris",
    priority: "Low",
    status: "Resolved",
    coordinates: [-0.181, 5.556],
    description:
      "Synthetic completed maintenance example. No real-world work is represented.",
    history: statuses.map((s) => s + " · DEMO"),
  },
];
// Synthetic fixtures reproduce the reference dashboard's demo counts. Their locations
// and descriptions are invented, and they must never be treated as observed events.
const demoAreas: Array<{ name: string; coordinates: [number, number] }> = [
  { name: "Circle", coordinates: [-0.218, 5.573] },
  { name: "Nima", coordinates: [-0.195, 5.592] },
  { name: "Achimota", coordinates: [-0.232, 5.622] },
  { name: "Kaneshie", coordinates: [-0.247, 5.572] },
  { name: "Adabraka", coordinates: [-0.211, 5.565] },
];
const demoCategories = ["Blockage", "Flooding", "Debris", "Damaged culvert"];
const additionalDemoIncidents: Incident[] = Array.from(
  { length: 20 },
  (_, index) => {
    const area = demoAreas[index % demoAreas.length];
    const category = demoCategories[index % demoCategories.length];
    const status: Status =
      index < 8 ? "In Progress" : index < 18 ? "Resolved" : "Under Review";
    const history = statuses
      .slice(0, statuses.indexOf(status) + 1)
      .map((step) => `${step} · DEMO`);
    return {
      id: `AF-${String(index + 5).padStart(3, "0")}`,
      title: `Synthetic ${category.toLowerCase()} report ${index + 1}`,
      area: area.name,
      category,
      priority: index < 3 ? "High" : "Medium",
      status,
      coordinates: [
        area.coordinates[0] + (index % 4) * 0.001,
        area.coordinates[1] + (index % 3) * 0.001,
      ],
      description:
        "Synthetic example created for the demo. It does not represent an observed incident.",
      history,
      mapVisible: false,
    };
  },
);
/** Prior synthetic snapshot for the demo percentage-change badges. */
export const demoPreviousSnapshot = { totalReports: 21, resolvedReports: 10 };
export const demoIncidents: Incident[] = [
  ...featuredDemoIncidents,
  ...additionalDemoIncidents,
];
export const places: Record<string, [number, number]> = {
  Accra: [-0.205, 5.58],
  Kaneshie: [-0.247, 5.572],
  Adabraka: [-0.211, 5.565],
  Dzorwulu: [-0.204, 5.613],
  Osu: [-0.181, 5.556],
  Madina: [-0.166, 5.672],
  Odaw: [-0.224, 5.589],
};
