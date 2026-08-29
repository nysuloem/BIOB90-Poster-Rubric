const sections = [
  {
    id: "standalone",
    title: "Standalone Poster",
    description: "Evaluate the poster itself before considering the oral presentation.",
    criteria: [
      "A statement of the group’s novel insight is clearly visible and stands out above all other content on the poster.",
      "The statement of the group’s novel insight is written in plain, conversational language, thereby reducing the need to process its meaning further and making it understandable to a non-expert on the topic.",
      "The group’s novel insight provides a new understanding of the topic being investigated, reflecting that the group has explored their topic in an original and unique way.",
      "i) The group’s novel insight clearly reflects the integration of information from three biological subdisciplines; or ii) the group’s novel insight clearly reflects the integration of information from three distinct organismal groups; or iii) the group’s novel insight clearly reflects the concept of Two-Eyed Seeing, integrating both Indigenous and Western scientific perspectives.",
      "The group’s novel insight is well-supported by research from valid sources (i.e., primary and secondary peer-reviewed articles).",
      "The supporting research clearly spans three biological subdisciplines or three distinct organismal groups or both Indigenous and Western scientific perspectives.",
      "The supporting research is presented in a clear manner and can be easily understood even by a non-expert on the topic.",
      "The amount of supporting research displayed on the poster is appropriate; that is, there is enough information provided to substantiate the group’s novel insight, but not so much information that it takes more than a few minutes to read, causing the information to become “noise”.",
      "All factual claims and data on the poster are supported by an in-text citation.",
      "The reference list is on the poster, complete, and appropriately formatted, with a one-to-one match between in-text citations and reference list entries.",
      "The poster content is presented in a visually-appealing format that minimizes large, dense paragraphs of text and, instead, favours figures and illustrations.",
      "Figures and tables are numbered appropriately and have clear captions that make them understandable without reference to the poster text.",
      "The poster’s overall appearance is pleasant, attractive, and uncluttered; it demands engagement from its audience and stands out among the other posters.",
      "The poster is free of noticeable spelling and grammatical errors."
    ]
  },
  {
    id: "presentation",
    title: "Poster Presentation",
    description: "Evaluate how the students explain and discuss their work.",
    criteria: [
      "The students use their poster as a presentation aid; that is to say, the students do not simply read their poster but rather engage in a conversation about their novel insight using the poster to supplement the discussion.",
      "All students seem to understand the research that they are presenting and are comfortable using appropriate scientific terminology.",
      "The students present their research in an enthusiastic manner that shows they are excited about what they have accomplished during this project.",
      "The students are able to comfortably walk through their poster presentation in no longer than 10 minutes, thereby allowing sufficient time for questions and conversation.",
      "All students exhibit good presentation skills (e.g., eye contact, clear voice, keeps audience attention, etc.).",
      "All students can answer reasonable questions about their research."
    ]
  }
];

let index = 0;
const rubric = sections.map((section) => ({
  ...section,
  criteria: section.criteria.map((text) => ({
    id: `${section.id}-${++index}`,
    number: index,
    text
  }))
}));

const criterionIds = rubric.flatMap((section) => section.criteria.map((criterion) => criterion.id));

module.exports = { rubric, criterionIds };
