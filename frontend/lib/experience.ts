export type ExperienceMode = "quick" | "guided" | "studio";

export type ProjectType =
  | "home_decor"
  | "event_celebration"
  | "personal_project"
  | "routine_lifestyle"
  | "content_writing"
  | "product_app"
  | "business_service"
  | "workflow_process"
  | "teaching_lesson";

export const EXPERIENCE_OPTIONS: Array<{ value: ExperienceMode; label: string; hint: string }> = [
  {
    value: "quick",
    label: "Quick ideas",
    hint: "Fast directions with light setup.",
  },
  {
    value: "guided",
    label: "Guided creator",
    hint: "Step-by-step support with smart prompts.",
  },
  {
    value: "studio",
    label: "Studio",
    hint: "Full canvas workflow with deep controls.",
  },
];

export const PROJECT_TYPE_OPTIONS: Array<{ value: ProjectType; label: string; samplePrompt: string }> =
  [
    {
      value: "home_decor",
      label: "Home / decor",
      samplePrompt: "Refresh my bedroom without overspending.",
    },
    {
      value: "event_celebration",
      label: "Event / celebration",
      samplePrompt: "Plan a memorable birthday surprise.",
    },
    {
      value: "personal_project",
      label: "Personal project",
      samplePrompt: "Design a weekend plan to finish my side project.",
    },
    {
      value: "routine_lifestyle",
      label: "Routine / lifestyle",
      samplePrompt: "Build a weekly routine that feels realistic.",
    },
    {
      value: "content_writing",
      label: "Content / writing",
      samplePrompt: "Outline a content series for beginner runners.",
    },
    {
      value: "product_app",
      label: "Product / app",
      samplePrompt: "Create an app concept that helps students study consistently.",
    },
    {
      value: "business_service",
      label: "Business / service idea",
      samplePrompt: "Shape a tutoring business concept for busy parents.",
    },
    {
      value: "workflow_process",
      label: "Workflow / process improvement",
      samplePrompt: "Redesign team handoff workflow to reduce rework.",
    },
    {
      value: "teaching_lesson",
      label: "Teaching / lesson idea",
      samplePrompt: "Create a lesson concept that makes fractions fun.",
    },
  ];

export function parseExperienceMode(value: string | undefined): ExperienceMode {
  if (value === "quick" || value === "guided" || value === "studio") return value;
  return "studio";
}

export function parseProjectType(value: string | undefined): ProjectType {
  const found = PROJECT_TYPE_OPTIONS.find((opt) => opt.value === value);
  return found?.value ?? "product_app";
}

export function projectTypeLabel(projectType: ProjectType): string {
  return PROJECT_TYPE_OPTIONS.find((opt) => opt.value === projectType)?.label ?? "Project";
}

export function deliverableLabel(projectType: ProjectType): string {
  switch (projectType) {
    case "home_decor":
      return "Design direction";
    case "event_celebration":
      return "Event plan";
    case "routine_lifestyle":
      return "Routine concept";
    case "product_app":
      return "Product concept";
    case "business_service":
      return "Venture direction";
    case "teaching_lesson":
      return "Lesson concept";
    case "workflow_process":
      return "Workflow plan";
    default:
      return "Concept plan";
  }
}
