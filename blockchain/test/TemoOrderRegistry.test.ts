import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

// Run with: npm test  (uses hardhat's in-memory network — no testnet funds needed)
describe("TemoOrderRegistry", () => {
  const orderId = (id: string) => ethers.keccak256(ethers.toUtf8Bytes(id));
  const hashOf = (s: string) => ethers.keccak256(ethers.toUtf8Bytes(s));

  async function deployFixture() {
    const [owner, service, stranger] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("TemoOrderRegistry");
    const registry = await factory.deploy();
    await registry.waitForDeployment();
    return { registry, owner, service, stranger };
  }

  describe("deployment", () => {
    it("sets the deployer as owner and as the first recorder", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      expect(await registry.owner()).to.equal(owner.address);
      expect(await registry.isRecorder(owner.address)).to.equal(true);
      expect(await registry.recordCount()).to.equal(0n);
    });
  });

  describe("recordOrder", () => {
    it("anchors a record and emits OrderRecorded", async () => {
      const { registry, owner } = await loadFixture(deployFixture);
      const id = orderId("order-1");
      const hash = hashOf("snapshot-1");

      await expect(registry.recordOrder(id, hash))
        .to.emit(registry, "OrderRecorded")
        .withArgs(id, hash, owner.address, anyValue);

      expect(await registry.recordCount()).to.equal(1n);
      const [storedHash, recordedAt, recordedBy, exists] = await registry.getRecord(id);
      expect(storedHash).to.equal(hash);
      expect(recordedAt).to.be.greaterThan(0n);
      expect(recordedBy).to.equal(owner.address);
      expect(exists).to.equal(true);
    });

    it("rejects a caller that is not a recorder", async () => {
      const { registry, stranger } = await loadFixture(deployFixture);
      await expect(
        registry.connect(stranger).recordOrder(orderId("order-2"), hashOf("snapshot-2"))
      ).to.be.revertedWithCustomError(registry, "NotRecorder");
    });

    it("rejects a zero data hash", async () => {
      const { registry } = await loadFixture(deployFixture);
      await expect(
        registry.recordOrder(orderId("order-3"), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(registry, "ZeroHash");
    });

    it("rejects anchoring the same order twice", async () => {
      const { registry } = await loadFixture(deployFixture);
      const id = orderId("order-4");
      await registry.recordOrder(id, hashOf("snapshot-4"));
      await expect(
        registry.recordOrder(id, hashOf("snapshot-4-tampered"))
      ).to.be.revertedWithCustomError(registry, "AlreadyRecorded");
    });
  });

  describe("verify (integrity)", () => {
    it("returns true when the hash matches and false when it does not", async () => {
      const { registry } = await loadFixture(deployFixture);
      const id = orderId("order-5");
      const hash = hashOf("snapshot-5");
      await registry.recordOrder(id, hash);

      expect(await registry.verify(id, hash)).to.equal(true);
      expect(await registry.verify(id, hashOf("snapshot-5-altered"))).to.equal(false);
      expect(await registry.verify(orderId("never-recorded"), hash)).to.equal(false);
    });
  });

  describe("access control", () => {
    it("lets the owner appoint and revoke a recorder", async () => {
      const { registry, service, stranger } = await loadFixture(deployFixture);

      await expect(registry.setRecorder(service.address, true))
        .to.emit(registry, "RecorderUpdated")
        .withArgs(service.address, true);

      await registry.connect(service).recordOrder(orderId("order-6"), hashOf("snapshot-6"));
      expect(await registry.recordCount()).to.equal(1n);

      await registry.setRecorder(service.address, false);
      await expect(
        registry.connect(service).recordOrder(orderId("order-7"), hashOf("snapshot-7"))
      ).to.be.revertedWithCustomError(registry, "NotRecorder");

      expect(await registry.isRecorder(stranger.address)).to.equal(false);
    });

    it("only lets the owner change recorders or ownership", async () => {
      const { registry, service, stranger } = await loadFixture(deployFixture);
      await expect(
        registry.connect(stranger).setRecorder(service.address, true)
      ).to.be.revertedWithCustomError(registry, "NotOwner");
      await expect(
        registry.connect(stranger).transferOwnership(stranger.address)
      ).to.be.revertedWithCustomError(registry, "NotOwner");
    });

    it("rejects a zero-address recorder or owner", async () => {
      const { registry } = await loadFixture(deployFixture);
      await expect(
        registry.setRecorder(ethers.ZeroAddress, true)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
      await expect(
        registry.transferOwnership(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(registry, "ZeroAddress");
    });

    it("transfers ownership", async () => {
      const { registry, owner, service } = await loadFixture(deployFixture);
      await expect(registry.transferOwnership(service.address))
        .to.emit(registry, "OwnershipTransferred")
        .withArgs(owner.address, service.address);
      expect(await registry.owner()).to.equal(service.address);
    });
  });
});

// anyValue helper for the timestamp argument in the event.
const anyValue = () => true;
