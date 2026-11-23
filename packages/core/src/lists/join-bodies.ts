/** Join already validated ordinary bodies, retaining the live boundary for the caller. */
export const joinListBodies = (left: HTMLElement, right: HTMLElement): Range => {
  for (const body of [left, right])
    if (!body.textContent && body.querySelectorAll('br').length <= 1)
      for (const placeholder of body.querySelectorAll('br')) placeholder.remove();
  const join = left.ownerDocument.createRange();
  join.selectNodeContents(left);
  join.collapse(false);
  left.append(...right.childNodes);
  right.remove();
  return join;
};
