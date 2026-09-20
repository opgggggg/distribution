// Pure ownership model. Moving a tab changes ownership, never its WebView identity.
export class NativeTabGroup {
  documents: string[] = [];
  active: string = '';
  id: string;
  home: string;
  constructor(id: string, home: string) {
    this.id = id;
    this.home = home;
    this.active = home;
  }
}

export class NativeTabGroups {
  groups: Map<string, NativeTabGroup> = new Map();

  owner(document: string): NativeTabGroup | undefined {
    for (const group of this.groups.values()) {
      if (group.documents.includes(document)) return group;
    }
    return undefined;
  }

  move(document: string, destination: string, before: string = ''): boolean {
    const source = this.owner(document);
    const target = this.groups.get(destination);
    if (!source || !target || document === before) return false;
    if (before && !target.documents.includes(before)) return false;
    const index = source.documents.indexOf(document);
    source.documents.splice(index, 1);
    if (source.active === document) {
      source.active = source.documents[Math.min(index, source.documents.length - 1)] ?? source.home;
    }
    const insertion = before ? target.documents.indexOf(before) : target.documents.length;
    target.documents.splice(insertion, 0, document);
    target.active = document;
    return true;
  }

  remove(document: string): void {
    const group = this.owner(document);
    if (!group) return;
    const index = group.documents.indexOf(document);
    group.documents.splice(index, 1);
    if (group.active === document) {
      group.active = group.documents[Math.min(index, group.documents.length - 1)] ?? group.home;
    }
  }
}
