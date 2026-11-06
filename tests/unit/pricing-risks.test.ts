import { expect, it } from "vitest";
import { priceRisks } from "@/server/pricing/risks";
it("cảnh báo lãi nhỏ sau cước/hoa hồng và thay giá 20%, không suy lãi khi thiếu vốn", () => {
  expect(priceRisks({oldPriceMmk:10000,priceMmk:12000,costMmk:10000,shipMmk:1000,commissionBp:1000})).toEqual({profit:-200,lowMargin:true,largeChange:true});
  expect(priceRisks({oldPriceMmk:10000,priceMmk:11000,costMmk:null,shipMmk:1000,commissionBp:1000})).toEqual({profit:null,lowMargin:false,largeChange:false});
  // Mức CTV cố định: trừ mức đó + % tầng trên thay cho % mặc định.
  expect(priceRisks({oldPriceMmk:10000,priceMmk:12000,costMmk:8000,shipMmk:1000,commissionBp:1200,fixedCommissionMmk:500,uplineBp:200})).toMatchObject({profit:12000-8000-1000-500-240});
});
