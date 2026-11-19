export interface OfficeListItem {
  paragraph: HTMLParagraphElement;
  marker: HTMLSpanElement;
  identity: string;
  level: number;
  kind: 'ul' | 'ol';
  number: number;
}

export interface OfficeListLevel {
  list: HTMLUListElement | HTMLOListElement;
  lastItem: HTMLLIElement;
  nextNumber: number;
}
