import { describe,expect,it } from "vitest";
import { formRegistries2025,registryFieldPath,validateRegisteredSourceData } from "../../src/form-registry/2025";

describe("2025 source form registry",()=>{
  it("publishes all five year-pinned form layouts and canonical paths",()=>{expect(Object.keys(formRegistries2025).sort()).toEqual(["1099-DIV","1099-INT","1099-MISC","1099-NEC","W2"]);expect(registryFieldPath("W2","box1")).toEqual(["federal","box1"]);expect(registryFieldPath("1099-NEC","box3")).toEqual(["boxes","excessGoldenParachutePayments"]);expect(registryFieldPath("1099-MISC","box14")).toEqual(["boxes","nonqualifiedDeferredCompensation"]);});
  it("captures every numbered 2025 field for the five supported source families",()=>{
    expect(keys("W2")).toEqual(["box1","box2","box3","box4","box5","box6","box7","box8","box9","box10","box11","box12","box13","box14","stateRows","localRows"]);
    expect(keys("1099-NEC")).toEqual(["box1","box2","box3","box4","stateRows"]);
    expect(keys("1099-MISC")).toEqual(["box1","box2","box3","box4","box5","box6","box7","box8","box9","box10","box11","box12","box13","box14","stateRows"]);
    expect(keys("1099-INT")).toEqual(["interestIncome","earlyWithdrawalPenalty","usSavingsBondInterest","federalWithholding","investmentExpenses","foreignTaxPaid","foreignCountry","taxExemptInterest","privateActivityBondInterest","marketDiscount","bondPremium","treasuryBondPremium","taxExemptBondPremium","taxExemptBondCusip","stateRows"]);
    expect(keys("1099-DIV")).toEqual(["ordinaryDividends","qualifiedDividends","capitalGainDistributions","unrecaptured1250Gain","section1202Gain","collectiblesGain","section897OrdinaryDividends","section897CapitalGain","nondividendDistributions","federalWithholding","section199ADividends","investmentExpenses","foreignTaxPaid","foreignCountry","cashLiquidationDistributions","noncashLiquidationDistributions","exemptInterestDividends","privateActivityBondInterestDividends","stateRows"]);
    expect(formRegistries2025["1099-MISC"].fields.find(({key})=>key==="box11")).toMatchObject({type:"money",label:"Fish purchased for resale"});
  });
  it("validates registered money, boolean, repeatable, and checkbox values while preserving unknown fields",()=>{expect(()=>validateRegisteredSourceData("W2",{federal:{box1:"100.00"},box12:[],box13:{retirementPlan:true},unknownFutureField:{raw:"preserved"}})).not.toThrow();expect(()=>validateRegisteredSourceData("1099-NEC",{boxes:{nonemployeeCompensation:100}})).toThrow("decimal string");expect(()=>validateRegisteredSourceData("1099-DIV",{stateRows:{state:"UT"}})).toThrow("must be an array");});
});

function keys(formType:string){return formRegistries2025[formType].fields.map(({key})=>key);}
