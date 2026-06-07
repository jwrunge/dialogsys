import type { Character } from '../schema/characters';

export const DIALOG_CHARACTERS_KEY = 'dialogsys-characters';

export type DialogCharactersContext = () => Character[];
