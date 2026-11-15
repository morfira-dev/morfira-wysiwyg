export interface FontFamilyOption {
  readonly id: string;
  readonly label: string;
  readonly family: string;
}

export interface FontsOptions {
  readonly families?: readonly FontFamilyOption[];
  readonly sizes?: readonly number[];
}

export interface FontState {
  disabled: boolean;
  family: string | false;
  size: string | false;
  familyMixed: boolean;
  sizeMixed: boolean;
}

export interface FontCommands {
  setFamily(id: string | false): void;
  setSize(size: number | false): void;
  getState(): FontState;
}
