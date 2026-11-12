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
	{
		term: 'BT-7 value added tax point date',
		level: Level.EN16931,
		data: { 'cbc:TaxPointDate': '2026-10-20' },
		marker: '20261020',
		expected:
			/<ram:ApplicableTradeTax>[\s\S]*<ram:CategoryCode>S<\/ram:CategoryCode>\s*<ram:TaxPointDate>\s*<udt:DateString format="102">20261020<\/udt:DateString>\s*<\/ram:TaxPointDate>\s*<ram:RateApplicablePercent>19<\/ram:RateApplicablePercent>/,
	},
	{
		term: 'BG-11 seller tax representative party',
		level: Level.BasicWL,
		data: {
			'cac:OrderReference': { 'cbc:ID': 'PO-4711' },
			'cac:TaxRepresentativeParty': {
				'cac:PartyName': { 'cbc:Name': 'TAXREP-62' },
				'cac:PostalAddress': {
					'cbc:StreetName': 'Rep Street 1',
					'cbc:CityName': 'Hamburg',
					'cbc:PostalZone': '20095',
					'cac:Country': { 'cbc:IdentificationCode': 'DE' },
				},
				'cac:PartyTaxScheme': {
					'cbc:CompanyID': 'DE987654321',
					'cac:TaxScheme': { 'cbc:ID': 'VAT' },
				},
			},
		},
		marker: 'TAXREP-62',
		expected:
			/<\/ram:BuyerTradeParty>\s*<ram:SellerTaxRepresentativeTradeParty>\s*<ram:Name>TAXREP-62<\/ram:Name>\s*<ram:PostalTradeAddress>\s*<ram:PostcodeCode>20095<\/ram:PostcodeCode>\s*<ram:LineOne>Rep Street 1<\/ram:LineOne>\s*<ram:CityName>Hamburg<\/ram:CityName>\s*<ram:CountryID>DE<\/ram:CountryID>\s*<\/ram:PostalTradeAddress>\s*<ram:SpecifiedTaxRegistration>\s*<ram:ID schemeID="VA">DE987654321<\/ram:ID>\s*<\/ram:SpecifiedTaxRegistration>\s*<\/ram:SellerTaxRepresentativeTradeParty>\s*<ram:BuyerOrderReferencedDocument>/,
	},
	{
		term: 'BT-17 tender or lot reference',
		level: Level.EN16931,
		data: {
			'cac:OriginatorDocumentReference': { 'cbc:ID': 'TENDER-17' },
			'cac:AdditionalDocumentReference': [{ 'cbc:ID': 'SUPPORTING-122' }],
		},
		marker: 'TENDER-17',
		expected:
			/<ram:AdditionalReferencedDocument>\s*<ram:IssuerAssignedID>SUPPORTING-122<\/ram:IssuerAssignedID>\s*<ram:TypeCode>916<\/ram:TypeCode>\s*<\/ram:AdditionalReferencedDocument>\s*<ram:AdditionalReferencedDocument>\s*<ram:IssuerAssignedID>TENDER-17<\/ram:IssuerAssignedID>\s*<ram:TypeCode>50<\/ram:TypeCode>\s*<\/ram:AdditionalReferencedDocument>/,
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
	service.patchInvoice(invoice);
	service.fillInvoiceDefaults(invoice);

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

describe('Document-level VAT dates with several VAT breakdowns', () => {
	const subtotal = (percent: string) => ({
		'cac:TaxCategory': {
			'cbc:ID': 'S',
			'cbc:Percent': percent,
			'cac:TaxScheme': { 'cbc:ID': 'VAT' },
		},
	});

	const taxTotal = (subtotals: object[]) => ({
		'cac:TaxTotal': [{ 'cac:TaxSubtotal': subtotals }],
	});

	const threeBreakdowns = taxTotal([
		subtotal('19'),
		subtotal('7'),
		subtotal('10'),
	]);

	const headerBreakdowns = (xml: string): string[] =>
		xml
			.match(
				/<ram:ApplicableHeaderTradeSettlement>[\s\S]*<\/ram:ApplicableHeaderTradeSettlement>/,
			)?.[0]
			.match(
				/<ram:ApplicableTradeTax>[\s\S]*?<\/ram:ApplicableTradeTax>/g,
			) ?? [];

	const dates = [
		{
			term: 'BT-7 value added tax point date',
			level: Level.EN16931,
			data: { 'cbc:TaxPointDate': '2026-11-12' },
			element: '<ram:TaxPointDate>',
		},
		{
			term: 'BT-8 value added tax point date code',
			level: Level.BasicWL,
			data: { 'cac:InvoicePeriod': { 'cbc:DescriptionCode': '35' } },
			element: '<ram:DueDateTypeCode>29</ram:DueDateTypeCode>',
		},
	];

	describe.each(dates)('$term', ({ level, data, element }) => {
		it.each(formats)(
			'is written once by %s, in the first VAT breakdown',
			async (format, Service, formatLevel) => {
				const xml = await render(format, Service, {
					...threeBreakdowns,
					...data,
				});
				const [first, ...others] = headerBreakdowns(xml);

				expect(others).toHaveLength(
					formatLevel >= Level.BasicWL ? 2 : 0,
				);
				expect(xml.split(element)).toHaveLength(
					formatLevel >= level ? 2 : 1,
				);
				if (formatLevel >= level) {
					expect(first).toContain(element);
					expect(first).toContain(
						'<ram:RateApplicablePercent>19</ram:RateApplicablePercent>',
					);
				}
			},
		);
	});

	it('survives a VAT breakdown that maps to nothing', async () => {
		const xml = await render(
			'CII',
			FormatCIIService,
			taxTotal([subtotal('19'), {}, subtotal('7')]),
		);

		expect(headerBreakdowns(xml)).toHaveLength(2);
	});
});
