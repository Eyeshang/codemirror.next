import ist from "ist"
import {EditorState, EditorSelection, defineFacet, computedFacet, computedFacetN, Extension, Precedence} from ".."

function mk(...extensions: Extension[]) {
  return EditorState.create({extensions})
}

let num = defineFacet<number>(), str = defineFacet<string>()

describe("EditorState facets", () => {
  it("allows querying of facets", () => {
    let st = mk(num(10), num(20), str("x"), str("y"))
    ist(st.facet(num).join(), "10,20")
    ist(st.facet(str).join(), "x,y")
  })

  it("includes sub-extenders", () => {
    let e = (s: string) => [num(s.length), num(+s)]
    let st = mk(num(5), e("20"), num(40), e("100"))
    ist(st.facet(num).join(), "5,2,20,40,3,100")
  })

  it("only includes duplicated extensions once", () => {
    let e = num(50)
    let st = mk(num(1), e, num(4), e)
    ist(st.facet(num).join(), "1,50,4")
  })

  it("returns an empty array for absent facet", () => {
    let st = mk()
    ist(JSON.stringify(st.facet(num)), "[]")
  })

  it("sorts extensions by priority", () => {
    let st = mk(str("a"), str("b"), Precedence.Extend.set(str("c")),
                Precedence.Override.set(str("d")),
                Precedence.Fallback.set(str("e")),
                Precedence.Extend.set(str("f")), str("g"))
    ist(st.facet(str).join(), "d,c,f,a,b,g,e")
  })

  it("lets sub-extensions inherit their parent's priority", () => {
    let e = (n: number) => num(n)
    let st = mk(num(1), Precedence.Override.set(e(2)), e(4))
    ist(st.facet(num).join(), "2,1,4")
  })

  it("supports dynamic facet", () => {
    let st = mk(num(1), computedFacet(num, [], () => 88))
    ist(st.facet(num).join(), "1,88")
  })

  it("only recomputes a facet value when necessary", () => {
    let st = mk(num(1), computedFacet(num, [str], s => s.facet(str).join().length), str("hello"))
    let array = st.facet(num)
    ist(array.join(), "1,5")
    ist(st.t().apply().facet(num), array)
  })

  it("can specify a dependency on the document", () => {
    let count = 0
    let st = mk(computedFacet(num, ["doc"], s => count++))
    ist(st.facet(num).join(), "0")
    st = st.t().replace(0, 0, "hello").apply()
    ist(st.facet(num).join(), "1")
    st = st.t().apply()
    ist(st.facet(num).join(), "1")
  })

  it("can specify a dependency on the selection", () => {
    let count = 0
    let st = mk(computedFacet(num, ["selection"], s => count++))
    ist(st.facet(num).join(), "0")
    st = st.t().replace(0, 0, "hello").apply()
    ist(st.facet(num).join(), "1")
    st = st.t().setSelection(EditorSelection.single(2)).apply()
    ist(st.facet(num).join(), "2")
    st = st.t().apply()
    ist(st.facet(num).join(), "2")
  })

  it("can provide multiple values at once", () => {
    let st = mk(computedFacetN(num, ["doc"], s => s.doc.length % 2 ? [100, 10] : []), num(1))
    ist(st.facet(num).join(), "1")
    st = st.t().replace(0, 0, "hello").apply()
    ist(st.facet(num).join(), "100,10,1")
  })

  it("works with a static combined facet", () => {
    let f = defineFacet<number, number>({combine: ns => ns.reduce((a, b) => a + b, 0)})
    let st = mk(f(1), f(2), f(3))
    ist(st.facet(f), 6)
  })

  it("works with a dynamic combined facet", () => {
    let f = defineFacet<number, number>({combine: ns => ns.reduce((a, b) => a + b, 0)})
    let st = mk(f(1), computedFacet(f, ["doc"], s => s.doc.length), f(3))
    ist(st.facet(f), 4)
    st = st.t().replace(0, 0, "hello").apply()
    ist(st.facet(f), 9)
  })

  it("survives reconfiguration", () => {
    let st = mk(computedFacet(num, ["doc"], s => s.doc.length), num(2), str("3"))
    let st2 = st.t().reconfigure([computedFacet(num, ["doc"], s => s.doc.length), num(2)]).apply()
    ist(st.facet(num), st2.facet(num))
    ist(st2.facet(str).length, 0)
  })

  it("preserves static facets across reconfiguration", () => {
    let st = mk(num(1), num(2), str("3"))
    let st2 = st.t().reconfigure([num(1), num(2)]).apply()
    ist(st.facet(num), st2.facet(num))
  })

  it("errors on cyclic dependencies", () => {
    ist.throws(() => mk(computedFacet(num, [str], s => s.facet(str).length),
                        computedFacet(str, [num], s => s.facet(num).join())),
               /cyclic/i)
  })
})
