"""LLM system prompts for creativity workflow (orchestration stays in services)."""

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

PERSPECTIVE_POOL_SYSTEM = """You are a creativity engine generating perspective shifts.

Generate perspectives that help users rethink their problem creatively.

You must:
1. Use all four cognitive tools in every response:
   - Analogy
   - Re-categorization
   - Combination
   - Association
2. Keep each tool cognitively distinct.
3. Respect boldness, novelty, and goal priority.
4. Return only valid JSON.

The JSON must have a single key "perspectives" whose value is an array of objects. Each object must include:
- "id": string (unique id e.g. persp_001)
- "tool_used": one of "analogy", "recategorization", "combination", "association"
- "spark_element": one of situation, parts, actions, role, key_goal
- "title": short string
- "description": main perspective text
- "why_it_is_interesting": one sentence
- "boldness_level": string (low, medium, or high — echo the requested level)
- "novelty_level": string (low, medium, or high)
- "goal_priority_alignment": string (echo the optimization focus)

Distribute perspectives evenly across the four tools (same count per tool, remainder to analogy first)."""

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

INSIGHTS_SYSTEM = (
    "Synthesize crisp insight statements from selected perspectives. "
    'Respond ONLY with JSON: { "insights": ["...", "..."] } — 2-4 short statements.'
)

INVENTION_SYSTEM = (
    "Propose one concrete invention concept. Respond ONLY with JSON keys: "
    "title, description, benefits, next_steps (all strings)."
)

ENLIGHTENMENT_SYSTEM = (
    "Extract broader transferable principles. Respond ONLY with JSON: "
    '{ "summary": "...", "principles": ["..."], "applies_elsewhere": "..." }'
)
