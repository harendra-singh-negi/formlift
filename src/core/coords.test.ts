import { describe, expect, it } from 'vitest'
import { boxStyle, fitInPage, moveBy, resizeBy, toPage } from './coords'

const p = { page: 1, x: 0.2, y: 0.3, width: 0.4, height: 0.05 }

describe('coords', () => {
  it('the same client point maps to the same page fraction at any zoom', () => {
    const at100 = toPage(150, 250, { left: 50, top: 50, width: 400, height: 800 })
    const at200 = toPage(250, 450, { left: 50, top: 50, width: 800, height: 1600 })
    expect(at100).toEqual({ x: 0.25, y: 0.25 })
    expect(at200).toEqual(at100)
  })

  it('points outside the page are clamped to it', () => {
    expect(toPage(-10, 5000, { left: 0, top: 0, width: 100, height: 100 })).toEqual({ x: 0, y: 1 })
  })

  it('moving keeps the box inside the page and snaps to the grid', () => {
    expect(moveBy(p, 0.9, 0)).toMatchObject({ x: 0.6, width: 0.4 })
    expect(moveBy(p, -1, -1)).toMatchObject({ x: 0, y: 0 })
    expect(moveBy(p, 0.013, 0.021, 0.01).x).toBeCloseTo(0.21)
  })

  it('resizing keeps a minimum size and stays inside the page', () => {
    expect(resizeBy(p, -1, -1)).toMatchObject({ width: 0.01, height: 0.01 })
    expect(resizeBy(p, 5, 5).width).toBeCloseTo(0.8)
    expect(resizeBy(p, 5, 5).height).toBeCloseTo(0.7)
  })

  it('fitInPage pulls an overflowing box back', () => {
    expect(fitInPage({ ...p, x: 0.9, y: 0.99 })).toMatchObject({ x: 0.6, y: 0.95 })
  })

  it('boxStyle uses percentages, independent of zoom', () => {
    expect(boxStyle(p)).toEqual({ left: '20%', top: '30%', width: '40%', height: '5%' })
  })
})
