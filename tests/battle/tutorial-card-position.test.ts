import test from 'node:test';
import assert from 'node:assert/strict';
import {placeTutorialCard, type TutorialBox} from '../../web/src/modules/battle/l00/tutorialCardPosition.ts';

const desktop = {width: 1200, height: 700};
const board = {x: 100, y: 150, width: 1000, height: 400};
const cardSize = {width: 520, height: 160};
function clearOf(card: TutorialBox, boxes: TutorialBox[]) {
  for (const box of boxes) assert.ok(card.x + card.width <= box.x || card.x >= box.x + box.width || card.y + card.height <= box.y || card.y >= box.y + box.height, 'lesson leaves the real teaching target clear');
}
function inside(card: TutorialBox, frame: {width: number; height: number}) {
  assert.ok(card.x >= 0 && card.y >= 0 && card.x + card.width <= frame.width && card.y + card.height <= frame.height, 'lesson stays inside the visible field');
}

test('unobstructed lesson is centred on the visible board instead of an empty corner', () => {
  const card = placeTutorialCard(desktop, board, cardSize, []);
  assert.equal(card.x + card.width / 2, board.x + board.width / 2);
  assert.equal(card.y + card.height / 2, board.y + board.height / 2);
});

test('central teaching target moves the card vertically while keeping its horizontal reading position', () => {
  const targets = [{x: 550, y: 300, width: 100, height: 100}];
  const card = placeTutorialCard(desktop, board, cardSize, targets);
  assert.equal(card.x + card.width / 2, board.x + board.width / 2);
  clearOf(card, targets);
  inside(card, desktop);
});

test('card moves to the side when a tall central menu leaves no centred space', () => {
  const frame = {width: 960, height: 600};
  const menu = {x: 330, y: 0, width: 300, height: 600};
  const card = placeTutorialCard(frame, {x: 0, y: 0, ...frame}, {width: 300, height: 180}, [menu]);
  clearOf(card, [menu]);
  inside(card, frame);
  assert.notEqual(card.x + card.width / 2, frame.width / 2);
});

test('energy lesson keeps cats visible without forcing its card against the left edge', () => {
  const cats = [{x: 350, y: 310, width: 90, height: 100}, {x: 690, y: 310, width: 90, height: 100}];
  const card = placeTutorialCard(desktop, board, cardSize, cats, cats);
  assert.equal(card.x + card.width / 2, board.x + board.width / 2);
  clearOf(card, cats);
});

test('narrow screen uses the centred space above or below the board without covering the cat and target', () => {
  const frame = {width: 375, height: 640};
  const narrowBoard = {x: 12, y: 260, width: 351, height: 150};
  const targets = [{x: 50, y: 280, width: 80, height: 100}, {x: 230, y: 290, width: 90, height: 100}];
  const card = placeTutorialCard(frame, narrowBoard, {width: 327, height: 200}, targets);
  assert.equal(card.x + card.width / 2, frame.width / 2);
  clearOf(card, targets);
  inside(card, frame);
});

test('short screen gives a long lesson a scrollable clear strip instead of covering the action', () => {
  const frame = {width: 375, height: 360};
  const shortBoard = {x: 0, y: 120, width: 375, height: 120};
  const targets = [{x: 100, y: 150, width: 175, height: 80}];
  const card = placeTutorialCard(frame, shortBoard, {width: 351, height: 300}, targets);
  assert.equal(card.x + card.width / 2, frame.width / 2);
  assert.ok(card.height < 300 && card.height >= 96);
  clearOf(card, targets);
  inside(card, frame);
});

test('oversized card is constrained to a very small visible viewport', () => {
  const frame = {width: 180, height: 160};
  const card = placeTutorialCard(frame, {x: 0, y: 0, ...frame}, {width: 520, height: 240}, []);
  inside(card, frame);
  assert.equal(card.x + card.width / 2, frame.width / 2);
});
