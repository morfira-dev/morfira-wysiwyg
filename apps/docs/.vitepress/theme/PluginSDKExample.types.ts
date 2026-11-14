export interface CalloutPayload {
  text: string;
  tone: 'note' | 'warning';
}

export interface ReferencePayload {
  text: string;
  id: string;
}
