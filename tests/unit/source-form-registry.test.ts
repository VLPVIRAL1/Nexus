import { describe,expect,it } from "vitest";
import { formRegistries2025,registryFieldPath,validateRegisteredSourceData } from "../../src/form-registry/2025";

describe("2025 source form registry",()=>{
  it("publishes all five year-pinned form layouts and canonical paths",()=>{expect(Object.keys(formRegistries2025).sort()).toEqual(["1099-DIV","1099-INT","1099-MISC","1099-NEC","W2"]);expect(registryFieldPath("W2","box1")).toEqual(["federal","box1"]);expect(registryFieldPath("1099-NEC","box3")).toEqual(["boxes","excessGoldenParachutePayments"]);expect(registryFieldPath("1099-MISC","box14")).toEqual(["boxes","nonqualifiedDeferredCompensation"]);});
  it("validates registered money, boolean, repeatable, and checkbox values while preserving unknown fields",()=>{expect(()=>validateRegisteredSourceData("W2",{federal:{box1:"100.00"},box12:[],box13:{retirementPlan:true},unknownFutureField:{raw:"preserved"}})).not.toThrow();expect(()=>validateRegisteredSourceData("1099-NEC",{boxes:{nonemployeeCompensation:100}})).toThrow("decimal string");expect(()=>validateRegisteredSourceData("1099-DIV",{stateRows:{state:"UT"}})).toThrow("must be an array");});
});
