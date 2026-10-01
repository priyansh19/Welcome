import data from '../content/profile.json'

export type Project = (typeof data.projects)[number]
export const profile = data
export const SECTIONS = ['home', 'about', 'skills', 'projects', 'experience', 'contact'] as const
export type Section = (typeof SECTIONS)[number]
