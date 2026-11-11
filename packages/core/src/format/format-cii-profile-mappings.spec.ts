import { describe, expect, it } from 'vitest';

import { Invoice } from '../invoice/invoice.interface';
import { InvoiceServiceOptions } from '../invoice/invoice.service';
import { Logger } from '../logger.interface';
import { FormatCIIService } from './format-cii.service';
import { FormatFacturXBasicService } from './format-factur-x-basic.service';
import { FormatFacturXBasicWLService } from './format-factur-x-basic-wl.service';
import { FormatFacturXEN16931Service } from './format-factur-x-en16931.service';
import { FormatFacturXExtendedService } from './format-factur-x-extended.service';
import { FormatFacturXMinimumService } from './format-factur-x-minimum.service';
import { FormatFacturXXRechnungService } from './format-factur-x-xrechnung.service';
import { FormatXRECHNUNGCIIService } from './format-xrechnung-cii.service';

/**
 * The lowest Factur-X conformance level whose XSD contains an element.
 * Formats without a Factur-X profile (CII, XRechnung) contain everything.
 */
enum Level {
	Minimum = 0,
	BasicWL = 1,
	Basic = 2,
	EN16931 = 3,
	Extended = 4,
}

const formats = [
	['Factur-X-Minimum', FormatFacturXMinimumService, Level.Minimum],
	['Factur-X-BasicWL', FormatFacturXBasicWLService, Level.BasicWL],
	['Factur-X-Basic', FormatFacturXBasicService, Level.Basic],
	['Factur-X-EN16931', FormatFacturXEN16931Service, Level.EN16931],
	['Factur-X-Extended', FormatFacturXExtendedService, Level.Extended],
	['Factur-X-XRechnung', FormatFacturXXRechnungService, Level.Extended],
	['CII', FormatCIIService, Level.Extended],
	['XRECHNUNG-CII', FormatXRECHNUNGCIIService, Level.Extended],
] as const;

type MappingCase = {
	term: string;
	level: Level;
	data: Record<string, unknown>;
	marker: string;
	expected: RegExp;
};

const cases: MappingCase[] = [
	{
		term: 'BT-13 buyer order reference',
		level: Level.Minimum,
		data: { 'cac:OrderReference': { 'cbc:ID': 'PO-4711' } },
		marker: 'PO-4711',
		expected:
			/<ram:ApplicableHeaderTradeAgreement>[\s\S]*<ram:BuyerOrderReferencedDocument>\s*<ram:IssuerAssignedID>PO-4711<\/ram:IssuerAssignedID>\s*<\/ram:BuyerOrderReferencedDocument>[\s\S]*<\/ram:ApplicableHeaderTradeAgreement>/,
	},
	{
		term: 'BT-11 project reference',
		level: Level.EN16931,
		data: { 'cac:ProjectReference': { 'cbc:ID': 'PROJECT-11' } },
		marker: 'PROJECT-11',
		expected:
			/<ram:SpecifiedProcuringProject>\s*<ram:ID>PROJECT-11<\/ram:ID>\s*<ram:Name>PROJECT-11<\/ram:Name>\s*<\/ram:SpecifiedProcuringProject>\s*<\/ram:ApplicableHeaderTradeAgreement>/,
	},
	{
		term: 'BT-16 despatch advice reference without delivery details',
		level: Level.BasicWL,
		data: { 'cac:DespatchDocumentReference': { 'cbc:ID': 'DESPATCH-16' } },
		marker: 'DESPATCH-16',
		expected:
			/<\/ram:ApplicableHeaderTradeAgreement>\s*<ram:ApplicableHeaderTradeDelivery>\s*<ram:DespatchAdviceReferencedDocument>\s*<ram:IssuerAssignedID>DESPATCH-16<\/ram:IssuerAssignedID>\s*<\/ram:DespatchAdviceReferencedDocument>\s*<\/ram:ApplicableHeaderTradeDelivery>\s*<ram:ApplicableHeaderTradeSettlement>/,
	},
	{
		term: 'BT-16 despatch advice reference after the actual delivery',
		level: Level.BasicWL,
		data: {
			'cac:DespatchDocumentReference': { 'cbc:ID': 'DESPATCH-16' },
			'cac:Delivery': { 'cbc:ActualDeliveryDate': '2026-10-15' },
		},
		marker: 'DESPATCH-16',
		expected:
			/<ram:ApplicableHeaderTradeDelivery>\s*<ram:ActualDeliverySupplyChainEvent>[\s\S]*<\/ram:ActualDeliverySupplyChainEvent>\s*<ram:DespatchAdviceReferencedDocument>\s*<ram:IssuerAssignedID>DESPATCH-16<\/ram:IssuerAssignedID>\s*<\/ram:DespatchAdviceReferencedDocument>\s*<\/ram:ApplicableHeaderTradeDelivery>\s*<ram:ApplicableHeaderTradeSettlement>/,
	},
	{
		term: 'BT-15 receiving advice reference without delivery details',
		level: Level.EN16931,
		data: { 'cac:ReceiptDocumentReference': { 'cbc:ID': 'RECEIPT-15' } },
		marker: 'RECEIPT-15',
		expected:
			/<ram:ApplicableHeaderTradeDelivery>\s*<ram:ReceivingAdviceReferencedDocument>\s*<ram:IssuerAssignedID>RECEIPT-15<\/ram:IssuerAssignedID>\s*<\/ram:ReceivingAdviceReferencedDocument>\s*<\/ram:ApplicableHeaderTradeDelivery>\s*<ram:ApplicableHeaderTradeSettlement>/,
	},
	{
		term: 'BT-15 receiving advice reference after the despatch advice reference',
		level: Level.EN16931,
		data: {
			'cac:Delivery': { 'cbc:ActualDeliveryDate': '2026-10-15' },
			'cac:DespatchDocumentReference': { 'cbc:ID': 'DESPATCH-16' },
			'cac:ReceiptDocumentReference': { 'cbc:ID': 'RECEIPT-15' },
		},
		marker: 'RECEIPT-15',
		expected:
			/<\/ram:ActualDeliverySupplyChainEvent>\s*<ram:DespatchAdviceReferencedDocument>[\s\S]*<\/ram:DespatchAdviceReferencedDocument>\s*<ram:ReceivingAdviceReferencedDocument>\s*<ram:IssuerAssignedID>RECEIPT-15<\/ram:IssuerAssignedID>\s*<\/ram:ReceivingAdviceReferencedDocument>\s*<\/ram:ApplicableHeaderTradeDelivery>\s*<ram:ApplicableHeaderTradeSettlement>/,
	},
	{
		term: 'BT-20 payment terms',
		level: Level.BasicWL,
		data: { 'cac:PaymentTerms': { 'cbc:Note': 'TERMS-20' } },
		marker: 'TERMS-20',
		expected:
			/<ram:SpecifiedTradePaymentTerms>\s*<ram:Description>TERMS-20<\/ram:Description>/,
	},
];

const render = async (
	format: string,
	Service: (typeof formats)[number][1],
	data: Record<string, unknown>,
): Promise<string> => {
	const invoice = {
		'ubl:Invoice': {
			'cbc:ID': '4711',
			'cbc:BuyerReference': 'REF',
			'cac:AccountingSupplierParty': {
				'cac:Party': {
					'cac:PartyLegalEntity': {
						'cbc:RegistrationName': 'Seller',
					},
				},
			},
			'cac:AccountingCustomerParty': {
				'cac:Party': {
					'cac:PartyLegalEntity': { 'cbc:RegistrationName': 'Buyer' },
				},
			},
			'cac:TaxTotal': [
				{
					'cac:TaxSubtotal': [
						{
							'cac:TaxCategory': {
								'cbc:ID': 'S',
								'cbc:Percent': '19',
								'cac:TaxScheme': { 'cbc:ID': 'VAT' },
							},
						},
					],
				},
			],
			...data,
		},
	} as unknown as Invoice;

	const service = new Service({} as unknown as Logger);

	return (await service.generate(invoice, {
		format,
		lang: 'en',
	} as InvoiceServiceOptions)) as string;
};

describe('CII mappings per Factur-X conformance level', () => {
	describe.each(cases)('$term', ({ level, data, marker, expected }) => {
		it.each(formats)(
			'is written by %s at the right position, or left out below its conformance level',
			async (format, Service, formatLevel) => {
				const xml = await render(format, Service, data);

				expect(typeof xml).toBe('string');
				if (formatLevel >= level) {
					expect(xml).toMatch(expected);
				} else {
					expect(xml).not.toContain(marker);
				}
			},
		);
	});
});
