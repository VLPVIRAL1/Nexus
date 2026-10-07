import w2 from "./w2.json";
import nec from "./1099-nec.json";
import misc from "./1099-misc.json";
import interest from "./1099-int.json";
import dividends from "./1099-div.json";

export type RegistryFieldType="money"|"string"|"boolean"|"repeatable_state"|"repeatable_local"|"repeatable_code_money"|"repeatable_open_label_money"|"checkbox_group";
export interface RegistryField{key:string;label:string;type:RegistryFieldType;calculation:string}
export interface FormRegistry{form:string;tax_year:number;revision:string;registry_version:string;fields:RegistryField[];pdf_output:string;integration:string}
export const formRegistries2025:Record<string,FormRegistry>={W2:w2 as FormRegistry,"1099-NEC":nec as FormRegistry,"1099-MISC":misc as FormRegistry,"1099-INT":interest as FormRegistry,"1099-DIV":dividends as FormRegistry};
const necNames:Record<string,string>={box1:"nonemployeeCompensation",box2:"directSales",box3:"excessGoldenParachutePayments",box4:"federalWithholding"};
const miscNames:Record<string,string>={box1:"rents",box2:"royalties",box3:"otherIncome",box4:"federalWithholding",box5:"fishingBoatProceeds",box6:"medicalPayments",box7:"directSales",box8:"substitutePayments",box9:"cropInsuranceProceeds",box10:"attorneyGrossProceeds",box11:"yearSpecificBox11",box12:"section409ADeferrals",box14:"nonqualifiedDeferredCompensation"};
export function registryFieldPath(formType:string,key:string):string[]{if(key==="stateRows"||key==="localRows")return[key];if(formType==="W2")return["box12","box13","box14"].includes(key)?[key]:["federal",key];if(formType==="1099-NEC")return["boxes",necNames[key]??key];if(formType==="1099-MISC")return key==="box13"?["fatcaIndicator"]:["boxes",miscNames[key]??key];return["boxes",key];}
export function validateRegisteredSourceData(formType:string,data:Record<string,unknown>){const registry=formRegistries2025[formType];if(!registry)return;for(const field of registry.fields){const value=readPath(data,registryFieldPath(formType,field.key));if(value===undefined||value===null||value==="")continue;if(field.type==="money"&&!(typeof value==="string"&&/^-?\d{1,16}(?:\.\d{1,2})?$/.test(value)))throw new Error(`${field.label} must be a decimal string with no more than two fractional digits.`);if(field.type==="boolean"&&typeof value!=="boolean")throw new Error(`${field.label} must be true, false, or blank.`);if(field.type.startsWith("repeatable_")&&!Array.isArray(value))throw new Error(`${field.label} must be an array.`);if(field.type==="checkbox_group"&&(!value||typeof value!=="object"||Array.isArray(value)))throw new Error(`${field.label} must be an object.`);if(field.type==="string"&&typeof value!=="string")throw new Error(`${field.label} must be text.`);}}
export function readPath(value:Record<string,unknown>,path:string[]):unknown{return path.reduce<unknown>((current,key)=>current&&typeof current==="object"&&!Array.isArray(current)?(current as Record<string,unknown>)[key]:undefined,value);}
