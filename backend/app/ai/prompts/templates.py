"""LLM system prompts for creativity workflow (orchestration stays in services)."""

from string import Template

SPARK_SYSTEM = (
    "You decompose the user's problem into SPARK. Respond ONLY with JSON keys: "
    "situation, parts, actions, role, key_goal. Each value is ONE string. "
    "Critical: the five strings must be MEANINGFULLY DIFFERENT—do not paste the problem_statement "
    "into every field or repeat the same sentence. "
    "Do NOT include field labels or meta text in the values (no prefixes like 'Parts:', 'Situation:', "
    "'Concrete nouns', 'Also consider:', or instructions—only the actual content for that dimension). "
    "situation = context and backdrop (who/when/where/why this matters; pressures and conditions). "
    "parts (product language: Pieces) = CONCRETE nouns and named entities ONLY—one item per line when multiple (use newline characters between items). "
    "No verbs, conjunctions (e.g. while, and), adverbs, or truncated words. Each line: a single noun phrase (e.g. Joggers, Water bottle, Heat advisory). "
    "actions = VERBS and behaviors—what people or systems do, try, or must accomplish. "
    "role = hats or relationships—who is involved (e.g. user, builder, gatekeeper) and their stance. "
    "key_goal = ONE clear outcome or success criterion (not a restatement of the whole problem). "
    "Keep each field 1–3 short sentences except parts may be a denser list."
)

VARIATIONS_SYSTEM = (
    "You generate NEW alternative phrasings for the requested SPARK elements (fresh wording each time). "
    "Each string must be ONLY the phrase itself—no labels, numbering, or prefixes. "
    "Include at most 6 strings per requested element. "
    'Respond ONLY with JSON: { "variations": { "element_name": ["...", "..."] } } '
)

PERSPECTIVE_POOL_SUBTYPE_REFERENCE = """
COGNITIVE TOOLS AND SUBTYPES (use exact subtype strings below for tool_used + subtype pairs)

1) ANALOGY — transfer structural patterns from another domain.
- functional: borrow same functional mechanism
- process: borrow workflow/process structure
- feedback_loop: continuous monitor-adjust cycle
- role: borrow actor role pattern
- failure_prevention: prevent failure before breakdown

2) RE-CATEGORIZATION — change framing, meaning, category, or scope. tool_used must be "recategorization".
- zoom_in: focus on smaller component
- zoom_out: broaden to larger system
- category_shift: assign new conceptual category
- opposite_framing: reverse normal assumption
- role_reversal: reverse responsibility

3) COMBINATION — merge concepts into hybrid ideas.
- object_combination
- feature_combination
- role_combination
- system_combination
- cross_domain_hybrid

4) ASSOCIATION — ideas from indirect conceptual links.
- symbolic
- environmental
- emotional
- random_stimulus
- pattern_association
""".strip()

PERSPECTIVE_POOL_FEW_SHOT_EXAMPLES_JSON = r"""
[
  {
    "id": "persp_example_001",
    "tool_used": "analogy",
    "subtype": "functional",
    "spark_element": "actions",
    "title": "Fuel alert hydration model",
    "description": "Hydration behaves like fuel monitoring in cars, warning runners before depletion becomes critical.",
    "why_it_is_interesting": "Transfers preventive alert logic from another domain."
  },
  {
    "id": "persp_example_002",
    "tool_used": "recategorization",
    "subtype": "zoom_out",
    "spark_element": "parts",
    "title": "Hydration ecosystem redesign",
    "description": "Hydration is reframed as a full ecosystem involving body signals, environment, and timing.",
    "why_it_is_interesting": "Expands the problem boundary significantly."
  },
  {
    "id": "persp_example_003",
    "tool_used": "combination",
    "subtype": "system_combination",
    "spark_element": "actions",
    "title": "Predictive hydration guidance system",
    "description": "Combine weather data, pace tracking, and sweat sensing into hydration prediction.",
    "why_it_is_interesting": "Creates proactive integrated solution."
  },
  {
    "id": "persp_example_004",
    "tool_used": "association",
    "subtype": "random_stimulus",
    "spark_element": "role",
    "title": "Rhythmic hydration cues",
    "description": "Hydration reminders follow musical rhythm patterns synchronized with running stride.",
    "why_it_is_interesting": "Introduces surprising low-friction timing cues."
  }
]
""".strip()

PERSPECTIVE_POOL_SYSTEM = """You are a creativity engine generating a unified perspective pool in ONE response.

Rules:
- Output ONLY valid JSON: a single object with key "perspectives" (array). No markdown, no prose outside JSON.
- Do NOT output rank_score or any ranking field; ranking is computed later in code.
- The user message lists ALLOCATION SLOTS in order. Produce exactly one perspective per slot, same array length and order.
- For each item i, set "tool_used" and "subtype" to match allocation slot i exactly (canonical strings).
- All four cognitive tools appear across the pool; counts follow the allocation (balanced; no tool exceeds 35% of the pool).
- Subtype diversity: honor the subtype given per slot; make the idea clearly reflect that subtype, not a generic use of the tool.
- Keep tools cognitively distinct from each other.
- Only these levers affect tone: boldness, novelty, goal_priority (echo optional level fields when present).

Required fields per perspective object:
- "id": unique string (e.g. persp_001)
- "tool_used": "analogy" | "recategorization" | "combination" | "association"
- "subtype": string from the subtype catalog in the user message
- "spark_element": one of situation, parts, actions, role, key_goal
- "title": short string
- "description": main perspective text for the USER'S problem (not the jogging example)

Preferred optional fields (include when helpful):
- "why_it_is_interesting"
- "boldness_level"
- "novelty_level"
- "goal_priority_alignment"
""".strip()

PERSPECTIVE_POOL_USER_TEMPLATE = Template(
    """Problem Statement:
$problem_statement

SPARK State:
Situation: $situation
Parts: $parts
Actions: $actions
Role: $role
Key Goal: $key_goal

Creative levers (only these apply):
Boldness: $boldness
Novelty: $novelty
Goal priority: $goal_priority

Maximum perspectives (must match allocation length): $max_perspectives

Subtype catalog:
$subtype_reference

Few-shot EXAMPLES (structure and field names only — invent fresh content for the user's problem, do not copy the jogging scenario):
$few_shot_examples

ALLOCATION SLOTS — generate exactly one perspective per slot, in this order. Each output object must use the same tool_used and subtype as its slot:
$allocation_json

Instructions:
- Return JSON: {"perspectives": [ ... ]} with length equal to the number of allocation slots.
- Each perspective must align its narrative with that slot's tool and subtype.
- Vary spark_element across the pool where sensible.
- Do not repeat titles or near-duplicate descriptions.
"""
)

PERSPECTIVES_MATRIX_SYSTEM = (
    "You combine PARTS ideas with ACTIONS ideas using creativity TOOLS. "
    "Tools are: analogy, recategorization, combination, association. "
    "Do NOT enumerate a full Cartesian product. Pick diverse, meaningful combinations "
    "that illuminate the problem. Each perspective must name which part idea and action idea "
    "it builds on. Respond ONLY with JSON: "
    '{ "perspectives": [ { "text": "...", "source_tool": "analogy|recategorization|combination|association", '
    '"spark_element": "parts+actions", "part_ref": "short quote from parts list", '
    '"action_ref": "short quote from actions list" } ] }'
)

INSIGHTS_SYSTEM = """You are a synthesis engine that extracts deeper truths from multiple creative perspectives.

You are synthesizing insights from selected creative perspectives grouped into themes.

Do NOT summarize the perspectives one by one.
Do NOT propose final inventions yet.

An insight means: "Here is the deeper truth emerging across those angles."

Your task:
- Look across the themes and their perspectives (and the problem + SPARK context).
- Identify recurring patterns, hidden assumptions, tensions, tradeoffs, or shifts in what really matters.
- Generate 2 to 5 distinct insights (fewer only if the material truly supports fewer).
- Each insight must be sharper than a summary and less concrete than a solution or product idea.
- Prefer phrasing that sounds like: the real issue is …; the hidden constraint is …; users need … before …;
  the deeper pattern is …; the tension is between … and ….

Avoid:
- Generic advice or truisms anyone could say without this problem
- Repeating or lightly paraphrasing perspective wording
- Invention proposals (apps, devices, specific features)
- Vague motivational statements

For EACH insight, you MUST return:
- "text": the insight (one or two sentences, concise).
- "why_it_matters": one short sentence on why this matters for later invention design.
- "theme_index": integer 0-based index of the primary theme this insight draws from (see user JSON "themes").
- "source_perspective_ids": array of perspective_id strings you relied on (subset of ids provided; at least one).

Respond ONLY with JSON of the form:
{ "insights": [ { "text": "...", "why_it_matters": "...", "theme_index": 0, "source_perspective_ids": ["..."] } ] }
"""

INVENTION_SYSTEM = (
    "Propose one concrete invention concept. Respond ONLY with JSON keys: "
    "title, description, benefits, next_steps (all strings)."
)

ENLIGHTENMENT_SYSTEM = (
    "Extract broader transferable principles. Respond ONLY with JSON: "
    '{ "summary": "...", "principles": ["..."], "applies_elsewhere": "..." }'
)
